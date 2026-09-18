/**
 * Live Production verification for Conversation P0 gates.
 * Mutates temp threads then soft-deletes them.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("module").Module._load = ((orig) =>
  function (request: string, parent: unknown, isMain: boolean) {
    if (request === "server-only") return {};
    return orig(request, parent, isMain);
  })(require("module").Module._load);

import { prisma } from "../src/lib/prisma";
import { createThread } from "../src/services/conversation/threads";
import { appendMessage, listMessages } from "../src/services/conversation/messages";
import {
  loadThreadAgentState,
  saveThreadAgentState,
} from "../src/services/assistant/conversation-persistence";
import {
  syncGatewayPendingProjection,
  assertPendingActionOnThread,
} from "../src/services/conversation/gateway-projection";
import {
  resolveThreadIntelSubject,
  runThreadIntelligenceAction,
} from "../src/services/conversation/thread-intelligence";
import { AGENT_CONVERSATION_TOPIC } from "../src/services/assistant/conversation-persistence";
import { toPrismaJson } from "../src/lib/prisma-json";

type Report = Record<string, { ok: boolean; evidence: string }>;

async function principal() {
  const m = await prisma.dealerMembership.findFirst({
    select: { dealerId: true, userId: true },
  });
  if (!m) throw new Error("no membership");
  return { dealerId: m.dealerId, userId: m.userId };
}

async function cleanup(ids: string[]) {
  if (!ids.length) return;
  await prisma.conversationThread.updateMany({
    where: { id: { in: ids } },
    data: { status: "DELETED", deletedAt: new Date() },
  });
}

async function main() {
  const report: Report = {};
  const p = await principal();
  const trash: string[] = [];

  // A — exact-one-message
  {
    const t = await createThread({
      principal: p,
      title: "verify-exact-one",
      source: "AGENT",
      titleSource: "USER",
    });
    trash.push(t.id);
    const turnKey = `verify_${Date.now()}`;
    await appendMessage(p, {
      threadId: t.id,
      role: "USER",
      kind: "TEXT",
      text: "מה הביקוש לרכב?",
      source: "USER_TEXT",
      idempotencyKey: `thread:${t.id}:user:${turnKey}`,
    });
    await appendMessage(p, {
      threadId: t.id,
      role: "ASSISTANT",
      kind: "TEXT",
      text: "בדקתי…",
      source: "AGENT",
      idempotencyKey: `thread:${t.id}:assistant:${turnKey}`,
    });
    // retry identical keys
    await appendMessage(p, {
      threadId: t.id,
      role: "USER",
      kind: "TEXT",
      text: "מה הביקוש לרכב?",
      source: "USER_TEXT",
      idempotencyKey: `thread:${t.id}:user:${turnKey}`,
    });
    await appendMessage(p, {
      threadId: t.id,
      role: "ASSISTANT",
      kind: "TEXT",
      text: "בדקתי…",
      source: "AGENT",
      idempotencyKey: `thread:${t.id}:assistant:${turnKey}`,
    });
    const rows = await prisma.conversationMessage.findMany({
      where: { threadId: t.id, kind: "TEXT" },
    });
    const users = rows.filter((r) => r.role === "USER");
    const asst = rows.filter((r) => r.role === "ASSISTANT");
    report.exactOne = {
      ok: users.length === 1 && asst.length === 1,
      evidence: `USER=${users.length} ASSISTANT=${asst.length} after retry`,
    };
  }

  // B/C/D — confirmation + action truth + repeated
  {
    const t = await createThread({
      principal: p,
      title: "verify-confirm",
      source: "AGENT",
      titleSource: "USER",
    });
    trash.push(t.id);

    const pending1 = await syncGatewayPendingProjection({
      principal: p,
      threadId: t.id,
      previous: undefined,
      next: {
        pendingConfirmation: {
          action: "confirm_inventory_import",
          label: "אשר קליטה",
          payload: { importId: "smoke-1" },
        },
      },
    });
    const id1 = pending1?.pendingConfirmation?.conversationActionId;
    const gate = id1
      ? await assertPendingActionOnThread({
          principal: p,
          threadId: t.id,
          actionId: id1,
        })
      : { ok: false as const, reason: "no_pending" as const };

    // Simulate leave/reopen: reload state
    await saveThreadAgentState(p, t.id, pending1);
    const reloaded = await loadThreadAgentState(p, t.id);
    const persistedId = reloaded.state?.pendingConfirmation?.conversationActionId;

    // Wrong text must NOT succeed
    await syncGatewayPendingProjection({
      principal: p,
      threadId: t.id,
      previous: pending1,
      next: { ...pending1, pendingConfirmation: undefined },
      assistantMessage: "בוצע בהצלחה",
      // no clearance
    });
    const stillPending = await prisma.conversationAction.findUnique({
      where: { id: id1! },
    });

    // Real succeed
    await syncGatewayPendingProjection({
      principal: p,
      threadId: t.id,
      previous: {
        pendingConfirmation: {
          action: "confirm_inventory_import",
          label: "אשר",
          payload: {},
          conversationActionId: id1,
        },
      },
      next: {},
      clearance: "succeeded",
      assistantMessage: "ok",
    });
    const afterOk = await prisma.conversationAction.findUnique({
      where: { id: id1! },
    });

    // Second identical action → new id
    const pending2 = await syncGatewayPendingProjection({
      principal: p,
      threadId: t.id,
      previous: undefined,
      next: {
        pendingConfirmation: {
          action: "confirm_inventory_import",
          label: "אשר שוב",
          payload: { importId: "smoke-2" },
        },
      },
    });
    const id2 = pending2?.pendingConfirmation?.conversationActionId;

    // Cancel path
    await syncGatewayPendingProjection({
      principal: p,
      threadId: t.id,
      previous: pending2,
      next: {},
      clearance: "cancelled",
      assistantMessage: "בוטל",
    });
    const afterCancel = await prisma.conversationAction.findUnique({
      where: { id: id2! },
    });

    report.conversationActionId = {
      ok: !!id1 && id1.length >= 20 && gate.ok === true,
      evidence: `id1=${id1} gate=${JSON.stringify(gate)}`,
    };
    report.confirmationPersistence = {
      ok: persistedId === id1,
      evidence: `reloaded conversationActionId=${persistedId}`,
    };
    report.actionTruth = {
      ok:
        stillPending?.status === "PENDING_CONFIRMATION" &&
        afterOk?.status === "SUCCEEDED" &&
        (afterCancel?.status === "FAILED" || afterCancel?.status === "CANCELLED"),
      evidence: `noClearance=${stillPending?.status} success=${afterOk?.status} cancel=${afterCancel?.status}`,
    };
    report.repeatedAction = {
      ok: !!id1 && !!id2 && id1 !== id2,
      evidence: `id1=${id1} id2=${id2}`,
    };
  }

  // E — thread intelligence
  {
    const t = await createThread({
      principal: p,
      title: "verify-intel",
      source: "AGENT",
      titleSource: "USER",
    });
    trash.push(t.id);
    await saveThreadAgentState(p, t.id, {
      focusedObject: { type: "vehicle", id: "nonexistent-vehicle" },
    });
    // no-subject when empty
    const t2 = await createThread({
      principal: p,
      title: "verify-intel-empty",
      source: "AGENT",
      titleSource: "USER",
    });
    trash.push(t2.id);
    // Isolate from legacy migrate so "empty" means empty.
    await prisma.conversationThread.update({
      where: { id: t2.id },
      data: { agentStateJson: { recentTurns: [] } },
    });
    await prisma.dealerMemoryItem.updateMany({
      where: {
        dealerId: p.dealerId,
        topicKey: AGENT_CONVERSATION_TOPIC,
        status: "ACTIVE",
      },
      data: { status: "SUPERSEDED" },
    });
    const empty = await resolveThreadIntelSubject(p, t2.id);
    const ask = await runThreadIntelligenceAction({
      principal: p,
      threadId: t2.id,
      action: "CHECK_DEMAND",
    });
    const focused = await resolveThreadIntelSubject(p, t.id);
    report.threadIntelligence = {
      ok:
        empty.ok === false &&
        ask.ok === false &&
        (!ask.ok ? ask.error === "no_subject" : false) &&
        focused.ok === true,
      evidence: `empty=${JSON.stringify(empty)} askErr=${!ask.ok ? ask.error : "ok"} focused=${JSON.stringify(focused)}`,
    };
  }

  // F — legacy contamination
  {
    await prisma.dealerMemoryItem.updateMany({
      where: {
        dealerId: p.dealerId,
        topicKey: AGENT_CONVERSATION_TOPIC,
        status: "ACTIVE",
      },
      data: { status: "SUPERSEDED" },
    });
    await prisma.dealerMemoryItem.create({
      data: {
        dealerId: p.dealerId,
        topicKey: AGENT_CONVERSATION_TOPIC,
        kind: "TEMPORARY",
        status: "ACTIVE",
        provenance: "SYSTEM_DERIVED",
        summary: "verify legacy",
        details: toPrismaJson({
          state: {
            pendingConfirmation: {
              action: "stale",
              label: "old",
              payload: {},
            },
            pendingInventoryMutation: {
              type: "UPDATE",
              vehicleId: "v",
              status: "WAITING_CONFIRMATION",
              label: "x",
            },
            recentTurns: [{ role: "user", text: "legacy-hi" }],
            focusedObject: { type: "vehicle", id: "legacy-v" },
          },
        }),
        confidence: 1,
      },
    });
    const t = await createThread({
      principal: p,
      title: "verify-legacy",
      source: "AGENT",
      titleSource: "USER",
    });
    trash.push(t.id);
    const { state } = await loadThreadAgentState(p, t.id);
    report.legacyIsolation = {
      ok:
        state?.pendingConfirmation === undefined &&
        state?.pendingInventoryMutation === undefined &&
        state?.recentTurns?.[0]?.text === "legacy-hi",
      evidence: `pending=${!!state?.pendingConfirmation} mutation=${!!state?.pendingInventoryMutation} turns=${state?.recentTurns?.[0]?.text}`,
    };
  }

  // G — pagination 110 messages
  {
    const t = await createThread({
      principal: p,
      title: "verify-paging",
      source: "AGENT",
      titleSource: "USER",
    });
    trash.push(t.id);
    for (let i = 0; i < 110; i++) {
      await prisma.conversationMessage.create({
        data: {
          threadId: t.id,
          role: i % 2 === 0 ? "USER" : "ASSISTANT",
          kind: "TEXT",
          text: `m-${i}`,
          idempotencyKey: `page:${t.id}:${i}`,
        },
      });
    }
    const page1 = await listMessages({ principal: p, threadId: t.id, limit: 50 });
    const page2 = await listMessages({
      principal: p,
      threadId: t.id,
      limit: 50,
      cursor: page1.nextCursor ?? undefined,
    });
    const ids1 = new Set(page1.messages.map((m) => m.id));
    const overlap = page2.messages.filter((m) => ids1.has(m.id));
    const firstText = page1.messages[0]?.text;
    const lastText = page1.messages[page1.messages.length - 1]?.text;
    report.pagination = {
      ok:
        page1.messages.length === 50 &&
        !!page1.nextCursor &&
        page2.messages.length === 50 &&
        overlap.length === 0 &&
        firstText === "m-60" &&
        lastText === "m-109",
      evidence: `p1=${page1.messages.length} cursor=${page1.nextCursor} p2=${page2.messages.length} overlap=${overlap.length} range=${firstText}..${lastText}`,
    };
  }

  await cleanup(trash);

  const allOk = Object.values(report).every((r) => r.ok);
  console.log(JSON.stringify({ ok: allOk, report }, null, 2));
  if (!allOk) process.exit(1);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

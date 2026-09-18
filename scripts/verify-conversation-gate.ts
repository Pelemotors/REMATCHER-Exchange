/**
 * Live VPS verification for Conversation hardening gates.
 * Uses ONLY the dedicated dealer: "verification / conversation-gate".
 * All created rows are tagged with runId provenance and cleaned up.
 *
 * Run:
 *   node -r ./scripts/register-server-only.cjs --import tsx scripts/verify-conversation-gate.ts
 */
import { createRequire } from "node:module";

// Patch server-only before any app imports (ESM-safe via dynamic import below).
const require = createRequire(import.meta.url);
const Module = require("module") as typeof import("module");
const origLoad = Module._load;
Module._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "server-only") return {};
  return origLoad(request, parent, isMain);
};

import { randomUUID } from "crypto";

const VERIFY_DEALER_NAME = "verification / conversation-gate";
const RUN_PREFIX = "verify-cg";

type Report = Record<string, { ok: boolean; evidence: string }>;

async function assertVpsDb(prismaUrl: string): Promise<string> {
  const u = prismaUrl;
  const host = (u.match(/@([^/:]+)/) || [])[1] ?? "";
  const port = (u.match(/:(\d+)\//) || [])[1] ?? "";
  const db = (u.match(/\/([^/?]+)(\?|$)/) || [])[1] ?? "";
  if (!/127\.0\.0\.1|localhost/.test(host) || port !== "5436") {
    throw new Error(
      `DB authority mismatch — expected VPS localhost:5436, got host=${host} port=${port}`
    );
  }
  if (!/rematcher_exchange/i.test(db)) {
    throw new Error(`DB authority mismatch — unexpected db name=${db}`);
  }
  return `VPS PostgreSQL ${host}:${port}/${db}`;
}

async function main() {
  // Dynamic imports after server-only stub
  const { prisma } = await import("../src/lib/prisma");
  const { createThread } = await import("../src/services/conversation/threads");
  const { listMessages } = await import(
    "../src/services/conversation/messages"
  );
  const {
    AGENT_CONVERSATION_TOPIC,
    loadThreadAgentState,
    saveThreadAgentState,
  } = await import("../src/services/assistant/conversation-persistence");
  const {
    syncGatewayPendingProjection,
    assertPendingActionOnThread,
  } = await import("../src/services/conversation/gateway-projection");
  const {
    resolveThreadIntelSubject,
    runThreadIntelligenceAction,
  } = await import("../src/services/conversation/thread-intelligence");
  const { runAssistantChatTurn } = await import(
    "../src/services/assistant/assistant-chat-turn"
  );
  const { toPrismaJson } = await import("../src/lib/prisma-json");

  const report: Report = {};
  const runId = randomUUID().slice(0, 8);
  const dbEvidence = await assertVpsDb(process.env.DATABASE_URL ?? "");
  report.dbAuthority = { ok: true, evidence: dbEvidence };

  // Dedicated verification dealer — always SYNTHETIC (never REAL market)
  let dealer = await prisma.dealer.findFirst({
    where: { businessName: VERIFY_DEALER_NAME },
    select: { id: true, marketMode: true, cohort: true },
  });
  if (!dealer) {
    dealer = await prisma.dealer.create({
      data: {
        businessName: VERIFY_DEALER_NAME,
        contactName: "Conversation Gate Verifier",
        phone: "0500000099",
        email: "conversation-gate-verify@rematcher.local",
        verificationStatus: "VERIFIED",
        isActive: true,
        cohort: "VERIFICATION",
        marketMode: "SYNTHETIC",
        canAccessSyntheticMarket: true,
      },
      select: { id: true, marketMode: true, cohort: true },
    });
  } else if (
    dealer.marketMode !== "SYNTHETIC" ||
    dealer.cohort !== "VERIFICATION"
  ) {
    dealer = await prisma.dealer.update({
      where: { id: dealer.id },
      data: {
        marketMode: "SYNTHETIC",
        cohort: "VERIFICATION",
        canAccessSyntheticMarket: true,
      },
      select: { id: true, marketMode: true, cohort: true },
    });
  }

  let membership = await prisma.dealerMembership.findFirst({
    where: { dealerId: dealer.id },
    select: { userId: true },
  });
  if (!membership) {
    const user =
      (await prisma.user.findFirst({
        where: { email: "conversation-gate-verify@rematcher.local" },
        select: { id: true },
      })) ??
      (await prisma.user.create({
        data: {
          email: "conversation-gate-verify@rematcher.local",
          name: "Conversation Gate Verifier",
          role: "DEALER_USER",
          accountStatus: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
        select: { id: true },
      }));
    membership = await prisma.dealerMembership.create({
      data: {
        dealerId: dealer.id,
        userId: user.id,
        role: "OWNER",
      },
      select: { userId: true },
    });
  }
  const p = { dealerId: dealer.id, userId: membership.userId };
  report.verificationDealer = {
    ok: dealer.marketMode === "SYNTHETIC",
    evidence: `DEDICATED name="${VERIFY_DEALER_NAME}" dealerId=${p.dealerId} marketMode=${dealer.marketMode}`,
  };

  const trashThreads: string[] = [];
  const trashMemory: string[] = [];

  async function hardCleanup() {
    if (trashThreads.length) {
      await prisma.conversationTurn.deleteMany({
        where: { threadId: { in: trashThreads } },
      });
      await prisma.conversationMessage.deleteMany({
        where: { threadId: { in: trashThreads } },
      });
      await prisma.conversationAction.deleteMany({
        where: { threadId: { in: trashThreads } },
      });
      await prisma.conversationThread.deleteMany({
        where: { id: { in: trashThreads } },
      });
    }
    if (trashMemory.length) {
      await prisma.dealerMemoryItem.deleteMany({
        where: { id: { in: trashMemory } },
      });
    }
  }

  try {
    // A — real first execution + sequential/concurrent retry + conflict + action race
    {
      const { claimPendingActionForExecution } = await import(
        "../src/services/conversation/actions"
      );
      const t = await createThread({
        principal: p,
        title: `${RUN_PREFIX}-${runId}-exact-one`,
        source: "AGENT",
        titleSource: "USER",
      });
      trashThreads.push(t.id);
      const clientTurnId = `${RUN_PREFIX}-${runId}-turn-a`;
      const first = await runAssistantChatTurn({
        dealerId: p.dealerId,
        userId: p.userId,
        threadId: t.id,
        message: "בדיקת קובץ מלאי",
        clientTurnId,
        context: { route: "/verify" },
      });
      const second = await runAssistantChatTurn({
        dealerId: p.dealerId,
        userId: p.userId,
        threadId: t.id,
        message: "בדיקת קובץ מלאי",
        clientTurnId,
        context: { route: "/verify" },
      });
      const rows = await prisma.conversationMessage.findMany({
        where: { threadId: t.id, kind: "TEXT" },
      });
      const users = rows.filter((r) => r.role === "USER");
      const asst = rows.filter((r) => r.role === "ASSISTANT");
      const turnRow = await prisma.conversationTurn.findUnique({
        where: {
          threadId_clientTurnId: { threadId: t.id, clientTurnId },
        },
      });
      report.firstExecution = {
        ok:
          first.ok === true &&
          first.replayed !== true &&
          users.length === 1 &&
          asst.length === 1 &&
          turnRow?.status === "COMPLETED",
        evidence: `replayed=${first.ok && !!first.replayed} USER=${users.length} ASSISTANT=${asst.length} turn=${turnRow?.status}`,
      };
      report.turnIdempotency = {
        ok:
          second.ok === true &&
          second.replayed === true &&
          users.length === 1 &&
          asst.length === 1,
        evidence: `replay2=${second.ok && second.replayed} USER=${users.length}`,
      };

      const tConc = await createThread({
        principal: p,
        title: `${RUN_PREFIX}-${runId}-concurrent`,
        source: "AGENT",
        titleSource: "USER",
      });
      trashThreads.push(tConc.id);
      const cid = `${RUN_PREFIX}-${runId}-conc`;
      const [c1, c2] = await Promise.all([
        runAssistantChatTurn({
          dealerId: p.dealerId,
          userId: p.userId,
          threadId: tConc.id,
          message: "בדיקת קובץ מלאי",
          clientTurnId: cid,
          context: { route: "/verify" },
        }),
        runAssistantChatTurn({
          dealerId: p.dealerId,
          userId: p.userId,
          threadId: tConc.id,
          message: "בדיקת קובץ מלאי",
          clientTurnId: cid,
          context: { route: "/verify" },
        }),
      ]);
      const concUsers = await prisma.conversationMessage.count({
        where: { threadId: tConc.id, role: "USER", kind: "TEXT" },
      });
      const owned =
        (c1.ok && !c1.replayed ? 1 : 0) + (c2.ok && !c2.replayed ? 1 : 0);
      const otherOk =
        (!c1.ok && c1.error === "TURN_IN_PROGRESS") ||
        (!c2.ok && c2.error === "TURN_IN_PROGRESS") ||
        (c1.ok && !!c1.replayed) ||
        (c2.ok && !!c2.replayed);
      report.concurrentRetry = {
        ok: concUsers === 1 && owned <= 1 && otherOk,
        evidence: `users=${concUsers} owned=${owned} c1=${c1.ok ? `ok replay=${!!c1.replayed}` : c1.error} c2=${c2.ok ? `ok replay=${!!c2.replayed}` : c2.error}`,
      };

      const conflict = await runAssistantChatTurn({
        dealerId: p.dealerId,
        userId: p.userId,
        threadId: t.id,
        message: "הודעה אחרת לגמרי",
        clientTurnId,
        context: { route: "/verify" },
      });
      report.idempotencyConflict = {
        ok: conflict.ok === false && conflict.error === "IDEMPOTENCY_CONFLICT",
        evidence: `err=${conflict.ok ? "ok" : conflict.error}`,
      };

      const tAct = await createThread({
        principal: p,
        title: `${RUN_PREFIX}-${runId}-act-race`,
        source: "AGENT",
        titleSource: "USER",
      });
      trashThreads.push(tAct.id);
      const pendingRace = await syncGatewayPendingProjection({
        principal: p,
        threadId: tAct.id,
        previous: undefined,
        next: {
          pendingConfirmation: {
            action: "mark_sold",
            label: "אשר",
            payload: { vehicleId: "no-vehicle" },
          },
        },
      });
      const actId = pendingRace?.pendingConfirmation?.conversationActionId!;
      await saveThreadAgentState(p, tAct.id, pendingRace);
      const [a1, a2] = await Promise.all([
        claimPendingActionForExecution({
          principal: p,
          threadId: tAct.id,
          actionId: actId,
        }),
        claimPendingActionForExecution({
          principal: p,
          threadId: tAct.id,
          actionId: actId,
        }),
      ]);
      const winners = [a1, a2].filter((x) => x.ok).length;
      const losers = [a1, a2].filter(
        (x) => !x.ok && x.error === "ACTION_IN_PROGRESS"
      ).length;
      report.actionConcurrentClaim = {
        ok: winners === 1 && losers === 1,
        evidence: `winners=${winners} losers=${losers}`,
      };
    }

    // B — Action Truth: failed clearance → FAILED
    {
      const t = await createThread({
        principal: p,
        title: `${RUN_PREFIX}-${runId}-action-truth`,
        source: "AGENT",
        titleSource: "USER",
      });
      trashThreads.push(t.id);
      const pending = await syncGatewayPendingProjection({
        principal: p,
        threadId: t.id,
        previous: undefined,
        next: {
          pendingConfirmation: {
            action: "mark_sold",
            label: "אשר מכירה",
            payload: { vehicleId: "no-such-vehicle" },
          },
        },
      });
      const id = pending?.pendingConfirmation?.conversationActionId!;
      await saveThreadAgentState(p, t.id, pending);

      await syncGatewayPendingProjection({
        principal: p,
        threadId: t.id,
        previous: pending,
        next: { ...pending, pendingConfirmation: undefined },
        assistantMessage: "בוצע בהצלחה",
      });
      const still = await prisma.conversationAction.findUnique({ where: { id } });

      await syncGatewayPendingProjection({
        principal: p,
        threadId: t.id,
        previous: {
          pendingConfirmation: {
            action: "mark_sold",
            label: "אשר",
            payload: {},
            conversationActionId: id,
          },
        },
        next: {},
        clearance: "failed",
        assistantMessage: "נכשל",
      });
      const afterFail = await prisma.conversationAction.findUnique({
        where: { id },
      });
      const resultMsg = await prisma.conversationMessage.findFirst({
        where: {
          threadId: t.id,
          kind: "ACTION_RESULT",
          idempotencyKey: `action_result:${id}:failed`,
        },
      });
      report.actionTruthFailed = {
        ok:
          still?.status === "PENDING_CONFIRMATION" &&
          afterFail?.status === "FAILED" &&
          !!resultMsg,
        evidence: `noClearance=${still?.status} failed=${afterFail?.status} resultMsg=${!!resultMsg}`,
      };
    }

    // C — exact ConversationAction binding mismatch → zero execution
    {
      const t = await createThread({
        principal: p,
        title: `${RUN_PREFIX}-${runId}-bind`,
        source: "AGENT",
        titleSource: "USER",
      });
      trashThreads.push(t.id);
      const pendingB = await syncGatewayPendingProjection({
        principal: p,
        threadId: t.id,
        previous: undefined,
        next: {
          pendingConfirmation: {
            action: "confirm_validation",
            label: "B",
            payload: { validationId: "b" },
          },
        },
      });
      const idB = pendingB?.pendingConfirmation?.conversationActionId!;
      await saveThreadAgentState(p, t.id, pendingB);

      const orphanA = await prisma.conversationAction.create({
        data: {
          threadId: t.id,
          actionType: "mark_sold",
          status: "PENDING_CONFIRMATION",
          gatewayActionId: "mark_sold",
          idempotencyKey: `${RUN_PREFIX}-${runId}-orphan-a`,
          payloadJson: toPrismaJson({ vehicleId: "x" }),
        },
      });

      const mismatch = await runAssistantChatTurn({
        dealerId: p.dealerId,
        userId: p.userId,
        threadId: t.id,
        message: "אשר",
        conversationActionId: orphanA.id,
        clientTurnId: `${RUN_PREFIX}-${runId}-mismatch`,
        context: { route: "/verify" },
      });
      const aAfter = await prisma.conversationAction.findUnique({
        where: { id: orphanA.id },
      });
      const bAfter = await prisma.conversationAction.findUnique({
        where: { id: idB },
      });
      const gateOk = await assertPendingActionOnThread({
        principal: p,
        threadId: t.id,
        actionId: idB,
        threadPendingActionId: idB,
      });
      const gateMismatch = await assertPendingActionOnThread({
        principal: p,
        threadId: t.id,
        actionId: orphanA.id,
        threadPendingActionId: idB,
      });
      report.exactBinding = {
        ok:
          mismatch.ok === false &&
          mismatch.error === "action_mismatch" &&
          aAfter?.status === "PENDING_CONFIRMATION" &&
          bAfter?.status === "PENDING_CONFIRMATION" &&
          gateOk.ok === true &&
          gateMismatch.ok === false,
        evidence: `turn=${mismatch.ok ? "ok" : mismatch.error} A=${aAfter?.status} B=${bAfter?.status} gateMismatch=${!gateMismatch.ok && "reason" in gateMismatch ? gateMismatch.reason : "ok"}`,
      };
    }

    // D — legacy focusedObject NOT imported
    {
      const mem = await prisma.dealerMemoryItem.create({
        data: {
          dealerId: p.dealerId,
          topicKey: AGENT_CONVERSATION_TOPIC,
          kind: "TEMPORARY",
          status: "ACTIVE",
          provenance: "SYSTEM_DERIVED",
          summary: `${RUN_PREFIX}-${runId} legacy fixture`,
          details: toPrismaJson({
            state: {
              pendingConfirmation: {
                action: "stale",
                label: "old",
                payload: {},
              },
              focusedObject: { type: "vehicle", id: "legacy-vehicle-A" },
              recentTurns: [{ role: "user", text: "legacy-hi" }],
            },
          }),
          confidence: 1,
        },
      });
      trashMemory.push(mem.id);
      const t = await createThread({
        principal: p,
        title: `${RUN_PREFIX}-${runId}-legacy`,
        source: "AGENT",
        titleSource: "USER",
      });
      trashThreads.push(t.id);
      const { state } = await loadThreadAgentState(p, t.id);
      const subject = await resolveThreadIntelSubject(p, t.id);
      const ask = await runThreadIntelligenceAction({
        principal: p,
        threadId: t.id,
        action: "CHECK_DEMAND",
      });
      report.legacyIsolation = {
        ok:
          state?.pendingConfirmation === undefined &&
          state?.focusedObject === undefined &&
          state?.recentTurns === undefined &&
          subject.ok === false &&
          ask.ok === false &&
          (!ask.ok ? ask.error === "no_subject" : false),
        evidence: `focused=${!!state?.focusedObject} turns=${!!state?.recentTurns} subject=${subject.ok} ask=${!ask.ok ? ask.error : "ok"}`,
      };
    }

    // E — pagination latest 50
    {
      const t = await createThread({
        principal: p,
        title: `${RUN_PREFIX}-${runId}-paging`,
        source: "AGENT",
        titleSource: "USER",
      });
      trashThreads.push(t.id);
      for (let i = 0; i < 110; i++) {
        await prisma.conversationMessage.create({
          data: {
            threadId: t.id,
            role: i % 2 === 0 ? "USER" : "ASSISTANT",
            kind: "TEXT",
            text: `m-${i}`,
            idempotencyKey: `${RUN_PREFIX}-${runId}:page:${i}`,
          },
        });
      }
      const page1 = await listMessages({
        principal: p,
        threadId: t.id,
        limit: 50,
      });
      const page2 = await listMessages({
        principal: p,
        threadId: t.id,
        limit: 50,
        cursor: page1.nextCursor ?? undefined,
      });
      const ids1 = new Set(page1.messages.map((m) => m.id));
      const overlap = page2.messages.filter((m) => ids1.has(m.id));
      report.pagination = {
        ok:
          page1.messages.length === 50 &&
          !!page1.nextCursor &&
          page2.messages.length === 50 &&
          overlap.length === 0 &&
          page1.messages[0]?.text === "m-60" &&
          page1.messages[49]?.text === "m-109",
        evidence: `p1=${page1.messages.length} p2=${page2.messages.length} overlap=${overlap.length}`,
      };
    }

    // F — reopen pending id stability
    {
      const t = await createThread({
        principal: p,
        title: `${RUN_PREFIX}-${runId}-reopen`,
        source: "AGENT",
        titleSource: "USER",
      });
      trashThreads.push(t.id);
      const pending = await syncGatewayPendingProjection({
        principal: p,
        threadId: t.id,
        previous: undefined,
        next: {
          pendingConfirmation: {
            action: "confirm_inventory_import",
            label: "אשר",
            payload: { importId: `${RUN_PREFIX}-${runId}` },
          },
        },
      });
      const id1 = pending?.pendingConfirmation?.conversationActionId;
      await saveThreadAgentState(p, t.id, pending);
      const reloaded = await loadThreadAgentState(p, t.id);
      report.reopen = {
        ok:
          !!id1 &&
          reloaded.state?.pendingConfirmation?.conversationActionId === id1,
        evidence: `id=${id1} reloaded=${reloaded.state?.pendingConfirmation?.conversationActionId}`,
      };
    }
  } finally {
    await hardCleanup();
  }

  const leftoverThreads = await prisma.conversationThread.count({
    where: {
      dealerId: p.dealerId,
      title: { startsWith: `${RUN_PREFIX}-${runId}` },
    },
  });
  const leftoverMem = await prisma.dealerMemoryItem.count({
    where: {
      dealerId: p.dealerId,
      summary: { contains: `${RUN_PREFIX}-${runId}` },
    },
  });
  report.cleanup = {
    ok: leftoverThreads === 0 && leftoverMem === 0,
    evidence: `threadsLeft=${leftoverThreads} memLeft=${leftoverMem}`,
  };

  const allOk = Object.values(report).every((r) => r.ok);
  console.log(JSON.stringify({ ok: allOk, runId, report }, null, 2));
  await prisma.$disconnect();
  if (!allOk) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});

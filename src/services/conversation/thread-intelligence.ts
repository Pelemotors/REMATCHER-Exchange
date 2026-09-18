import "server-only";
import { loadThreadAgentState } from "@/services/assistant/conversation-persistence";
import { appendMessage } from "@/services/conversation/messages";
import type { ConversationPrincipal } from "@/services/conversation/types";
import {
  runExchangeIntelligenceEngine,
  type ExchangeIntelAction,
} from "@/services/exchange-intelligence/engine";
import { prisma } from "@/lib/prisma";

const ENGINE_ACTIONS = new Set<string>([
  "MARKET_OVERVIEW",
  "CHECK_DEMAND",
  "CHECK_SUPPLY",
  "COMPARE_SIMILAR",
  "CHECK_BUY_PRICE",
  "CHECK_LIQUIDITY",
  "CHECK_TRADE_RISK",
  "MATCH_MY_CUSTOMERS",
]);

export type ThreadIntelSubject =
  | { vehicleId: string }
  | { demandId: string }
  | {
      make: string;
      model: string;
      yearMin?: number | null;
      yearMax?: number | null;
    };

export async function resolveThreadIntelSubject(
  principal: ConversationPrincipal,
  threadId: string
): Promise<
  | { ok: true; subject: ThreadIntelSubject }
  | { ok: false; reason: "no_subject"; prompt: string }
> {
  const { state } = await loadThreadAgentState(principal, threadId);

  if (state?.focusedObject?.type === "vehicle" && state.focusedObject.id) {
    return { ok: true, subject: { vehicleId: state.focusedObject.id } };
  }
  if (state?.focusedObject?.type === "demand" && state.focusedObject.id) {
    return { ok: true, subject: { demandId: state.focusedObject.id } };
  }

  const vehicleRef = state?.referencedEntities?.find((e) => e.type === "vehicle");
  if (vehicleRef?.id) {
    return { ok: true, subject: { vehicleId: vehicleRef.id } };
  }
  const demandRef = state?.referencedEntities?.find((e) => e.type === "demand");
  if (demandRef?.id) {
    return { ok: true, subject: { demandId: demandRef.id } };
  }

  // Intake candidate identity from recent VEHICLE_CANDIDATE payload
  const candidateMsg = await prisma.conversationMessage.findFirst({
    where: { threadId, kind: "VEHICLE_CANDIDATE" },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true, entityId: true },
  });
  if (candidateMsg?.entityId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: candidateMsg.entityId, dealerId: principal.dealerId },
      select: { id: true },
    });
    if (vehicle) return { ok: true, subject: { vehicleId: vehicle.id } };
  }
  const payload = candidateMsg?.payloadJson as
    | { make?: string; model?: string; year?: number; label?: string }
    | null;
  if (payload?.make && payload?.model) {
    return {
      ok: true,
      subject: {
        make: payload.make,
        model: payload.model,
        yearMin: payload.year ?? null,
        yearMax: payload.year ?? null,
      },
    };
  }

  // Linked intake batch committed vehicle
  const batch = await prisma.intakeBatch.findFirst({
    where: {
      conversationThreadId: threadId,
      dealerId: principal.dealerId,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      candidates: {
        where: { committedVehicleId: { not: null } },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { committedVehicleId: true, govIdentityJson: true },
      },
    },
  });
  const committed = batch?.candidates[0]?.committedVehicleId;
  if (committed) {
    return { ok: true, subject: { vehicleId: committed } };
  }
  const gov = batch?.candidates[0]?.govIdentityJson as
    | { make?: string; model?: string; year?: number }
    | null
    | undefined;
  if (gov?.make && gov?.model) {
    return {
      ok: true,
      subject: {
        make: gov.make,
        model: gov.model,
        yearMin: gov.year ?? null,
        yearMax: gov.year ?? null,
      },
    };
  }

  return {
    ok: false,
    reason: "no_subject",
    prompt: "על איזה רכב לבדוק? ציין דגם או בחר רכב מהשיחה.",
  };
}

export async function runThreadIntelligenceAction(input: {
  principal: ConversationPrincipal;
  threadId: string;
  action: string;
}): Promise<
  | { ok: true; result: unknown; messageId: string }
  | { ok: false; error: "invalid_action" | "no_subject" | "engine"; message?: string; prompt?: string }
> {
  if (!ENGINE_ACTIONS.has(input.action)) {
    return { ok: false, error: "invalid_action" };
  }

  const resolved = await resolveThreadIntelSubject(
    input.principal,
    input.threadId
  );
  if (!resolved.ok) {
    const { message } = await appendMessage(input.principal, {
      threadId: input.threadId,
      role: "ASSISTANT",
      kind: "STATUS",
      text: resolved.prompt,
      source: "thread_intelligence",
      idempotencyKey: `thread:${input.threadId}:intel:ask_subject:${input.action}:${Date.now()}`,
    });
    return {
      ok: false,
      error: "no_subject",
      prompt: resolved.prompt,
      message: message.text ?? resolved.prompt,
    };
  }

  const engine = await runExchangeIntelligenceEngine({
    dealerId: input.principal.dealerId,
    action: input.action as ExchangeIntelAction,
    subject: resolved.subject,
    offeredPrice: null,
    includeCustomerPhone: true,
  });

  if (!engine.ok) {
    const text =
      engine.error === "subject_unresolved"
        ? "לא הצלחתי לזהות את הרכב לבדיקה. ציין דגם או בחר רכב."
        : "לא הצלחתי להריץ את בדיקת המודיעין.";
    await appendMessage(input.principal, {
      threadId: input.threadId,
      role: "ASSISTANT",
      kind: "ERROR",
      text,
      source: "thread_intelligence",
      idempotencyKey: `thread:${input.threadId}:intel:err:${input.action}:${Date.now()}`,
    });
    return { ok: false, error: "engine", message: text };
  }

  const subjectLabel =
    "vehicleId" in resolved.subject
      ? resolved.subject.vehicleId
      : "demandId" in resolved.subject
        ? resolved.subject.demandId
        : `${resolved.subject.make} ${resolved.subject.model}`.trim();
  const summary = `תוצאת ${input.action} · ${subjectLabel}`;

  const { message } = await appendMessage(input.principal, {
    threadId: input.threadId,
    role: "ASSISTANT",
    kind: "INTELLIGENCE_RESULT",
    text: summary,
    payloadJson: engine as unknown as Record<string, unknown>,
    source: "thread_intelligence",
    idempotencyKey: `thread:${input.threadId}:intel:${input.action}:${Date.now()}`,
  });

  return { ok: true, result: engine, messageId: message.id };
}

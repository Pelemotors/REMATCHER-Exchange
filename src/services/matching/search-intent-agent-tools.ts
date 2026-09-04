/**
 * Agent tools for Search Intent 2.0 — draft/inspect/summarize/clarify.
 * Activation of ACTIVE demand still goes through Action Gateway confirmation.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import {
  createAndActivateSearchIntent,
  getActiveSearchIntent,
  parseStructuredIntent,
} from "@/services/matching/search-intent-service";
import {
  summarizeIntentHe,
  type StructuredSearchIntent,
} from "@/services/matching/search-intent-types";
import { reportDealerBusinessEvent } from "@/services/exchange/events";
import { closeExchangeCaseOutcome } from "@/services/exchange/cases";

export const SEARCH_INTENT_TOOL_NAMES = [
  "draft_search_intent",
  "inspect_search_intent",
  "clarify_search_intent",
  "summarize_search_intent",
  "report_business_event",
] as const;

export type SearchIntentToolName = (typeof SEARCH_INTENT_TOOL_NAMES)[number];

export function isSearchIntentTool(
  name: string
): name is SearchIntentToolName {
  return (SEARCH_INTENT_TOOL_NAMES as readonly string[]).includes(name);
}

async function assertDemandOwned(dealerId: string, demandId: string) {
  return prisma.demand.findFirst({
    where: { id: demandId, dealerId },
    select: { id: true, status: true },
  });
}

function asIntent(raw: unknown): StructuredSearchIntent | null {
  if (!raw || typeof raw !== "object") return null;
  return parseStructuredIntent(raw);
}

export async function executeSearchIntentTool(params: {
  name: SearchIntentToolName;
  dealerId: string;
  args: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const { name, dealerId, args } = params;

  if (name === "inspect_search_intent") {
    const demandId = String(args.demandId ?? "");
    if (!demandId) return { ok: false, error: "demandId_required" };
    const owned = await assertDemandOwned(dealerId, demandId);
    if (!owned) return { ok: false, error: "not_found" };
    const row = await getActiveSearchIntent(demandId);
    if (!row) return { ok: false, error: "no_intent" };
    const structured = parseStructuredIntent(row.structuredIntent);
    return {
      ok: true,
      demandId,
      version: row.version,
      status: row.status,
      naturalLanguageSummary:
        row.naturalLanguageSummary ?? summarizeIntentHe(structured),
      structuredIntent: structured,
      confirmedAt: row.confirmedAt,
      note: "Structured intent is internal. Present a short natural Hebrew summary to the dealer — never ask them to pick HARD/SOFT or numeric weights.",
    };
  }

  if (name === "summarize_search_intent") {
    const demandId = String(args.demandId ?? "");
    if (!demandId) return { ok: false, error: "demandId_required" };
    const owned = await assertDemandOwned(dealerId, demandId);
    if (!owned) return { ok: false, error: "not_found" };
    const row = await getActiveSearchIntent(demandId);
    if (!row) return { ok: false, error: "no_intent" };
    const structured = parseStructuredIntent(row.structuredIntent);
    return {
      ok: true,
      demandId,
      version: row.version,
      summary:
        row.naturalLanguageSummary ?? summarizeIntentHe(structured),
    };
  }

  if (name === "draft_search_intent") {
    const demandId = String(args.demandId ?? "");
    const intent = asIntent(args.structuredIntent);
    if (!demandId || !intent) {
      return { ok: false, error: "demandId_and_structuredIntent_required" };
    }
    const owned = await assertDemandOwned(dealerId, demandId);
    if (!owned) return { ok: false, error: "not_found" };
    const summary =
      typeof args.naturalLanguageSummary === "string"
        ? args.naturalLanguageSummary
        : summarizeIntentHe(intent);
    const row = await createAndActivateSearchIntent({
      demandId,
      structuredIntent: intent,
      naturalLanguageSummary: summary,
      source: "agent_draft",
      confirm: false,
    });
    return {
      ok: true,
      draft: true,
      demandId,
      version: row.version,
      status: row.status,
      naturalLanguageSummary: summary,
      note: "DRAFT only — not active. To activate/update the live search, propose_mutation SEARCHES CREATE/UPDATE and wait for dealer confirmation via Action Gateway. Before proposing activation, give a short natural summary of the commercial intent.",
    };
  }

  if (name === "clarify_search_intent") {
    const demandId = String(args.demandId ?? "");
    const intent = asIntent(args.structuredIntent);
    if (!demandId || !intent) {
      return { ok: false, error: "demandId_and_structuredIntent_required" };
    }
    const owned = await assertDemandOwned(dealerId, demandId);
    if (!owned) return { ok: false, error: "not_found" };
    const activate = Boolean(args.activate);
    if (activate) {
      return {
        ok: false,
        error: "activation_requires_action_gateway",
        note: "Do not activate from this tool. Use propose_mutation with SEARCHES UPDATE/CREATE including structuredIntent in facts, then confirm_pending_action after dealer OK.",
        naturalLanguageSummary:
          typeof args.naturalLanguageSummary === "string"
            ? args.naturalLanguageSummary
            : summarizeIntentHe(intent),
      };
    }
    const summary =
      typeof args.naturalLanguageSummary === "string"
        ? args.naturalLanguageSummary
        : summarizeIntentHe(intent);
    const row = await createAndActivateSearchIntent({
      demandId,
      structuredIntent: intent,
      naturalLanguageSummary: summary,
      source: "agent_clarify",
      confirm: false,
    });
    return {
      ok: true,
      draft: true,
      demandId,
      version: row.version,
      status: row.status,
      naturalLanguageSummary: summary,
    };
  }

  if (name === "report_business_event") {
    const eventType = String(args.eventType ?? "");
    const allowed = new Set([
      "VEHICLE_SOLD",
      "EXTERNAL_PURCHASE_REPORTED",
      "EXTERNAL_DEAL_REPORTED",
      "MATCH_NO_DEAL",
      "MATCH_DEAL_CONFIRMED",
      "MATCH_STILL_ACTIVE",
      "INVENTORY_REMOVED",
    ]);
    if (!allowed.has(eventType)) {
      return {
        ok: false,
        error: "unsupported_event_type",
        note: "Only explicit dealer-reported business events. Never infer VEHICLE_SOLD from archive/removal.",
      };
    }
    const vehicleId =
      typeof args.vehicleId === "string" ? args.vehicleId : null;
    const candidateMatchId =
      typeof args.candidateMatchId === "string"
        ? args.candidateMatchId
        : null;
    if (!vehicleId && !candidateMatchId) {
      return {
        ok: false,
        error: "ambiguous_target",
        note: "Ask which vehicle/match if unclear — do not guess.",
      };
    }
    if (vehicleId) {
      const owned = await prisma.vehicle.findFirst({
        where: { id: vehicleId, dealerId },
        select: { id: true },
      });
      if (!owned) return { ok: false, error: "vehicle_not_found" };
    }
    if (candidateMatchId) {
      const owned = await prisma.candidateMatch.findFirst({
        where: {
          id: candidateMatchId,
          OR: [
            { demand: { dealerId } },
            { vehicle: { dealerId } },
          ],
        },
        select: { id: true },
      });
      if (!owned) return { ok: false, error: "match_not_found" };
    }

    const event = await reportDealerBusinessEvent({
      dealerId,
      eventType,
      vehicleId,
      candidateMatchId,
      demandId:
        typeof args.demandId === "string" ? args.demandId : null,
      evidenceNote:
        typeof args.evidenceNote === "string" ? args.evidenceNote : undefined,
      reason: typeof args.reason === "string" ? args.reason : undefined,
      eventData:
        args.eventData && typeof args.eventData === "object"
          ? (args.eventData as Record<string, unknown>)
          : undefined,
    });

    if (
      (eventType === "MATCH_NO_DEAL" || eventType === "MATCH_DEAL_CONFIRMED") &&
      candidateMatchId
    ) {
      const relevance =
        args.relevanceOutcome === "IRRELEVANT"
          ? "IRRELEVANT"
          : args.relevanceOutcome === "RELEVANT"
            ? "RELEVANT"
            : "UNKNOWN";
      const reasonCat =
        typeof args.outcomeReasonCategory === "string"
          ? args.outcomeReasonCategory
          : "UNKNOWN";
      await closeExchangeCaseOutcome({
        candidateMatchId,
        relevanceOutcome: relevance,
        transactionOutcome:
          eventType === "MATCH_DEAL_CONFIRMED" ? "DEAL_CONFIRMED" : "NO_DEAL",
        outcomeReasonCategory: reasonCat as
          | "PRICE"
          | "VEHICLE_CONDITION"
          | "SPEC_MISMATCH"
          | "AVAILABILITY"
          | "CUSTOMER_CHANGED_MIND"
          | "FINANCING"
          | "DEALER_DECISION"
          | "TIMING"
          | "SOLD_ELSEWHERE"
          | "NO_RESPONSE"
          | "OTHER"
          | "UNKNOWN",
        evidenceType: "DEALER_REPORTED",
      });
    }

    return { ok: true, eventId: event?.id, eventType };
  }

  return { ok: false, error: "unknown_tool" };
}

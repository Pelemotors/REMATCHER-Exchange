/**
 * Agent 4.1 — Intake + match-diagnostics tools (separate category, like Search Intent).
 * Scoped to THIS dealerId only. Mutations go through Action Gateway + confirmation.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { listIntakeBatchesForDealer } from "@/services/intake/batch";
import { derivePlateIdentityState } from "@/services/intake/plate-identity";
import { listOpenIntakeReviews } from "@/services/intake/review";
import { diagnoseDemandMatches } from "@/services/matching/match-diagnostics";

export const INTAKE_AGENT_TOOL_NAMES = [
  "get_my_intake_batches",
  "get_my_intake_candidates",
  "get_my_intake_candidate",
  "diagnose_my_search_matches",
  "get_my_attention_opportunities",
  "get_my_customers",
  "find_my_customer",
  "get_network_intelligence",
  "get_my_dealer_opportunities",
] as const;

export type IntakeAgentToolName = (typeof INTAKE_AGENT_TOOL_NAMES)[number];

export function isIntakeAgentTool(
  name: string
): name is IntakeAgentToolName {
  return (INTAKE_AGENT_TOOL_NAMES as readonly string[]).includes(name);
}

export async function executeIntakeTool(
  name: IntakeAgentToolName,
  dealerId: string,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  if (name === "get_my_intake_batches") {
    const batches = await listIntakeBatchesForDealer(dealerId);
    return {
      ok: true,
      count: batches.length,
      batches,
      note: "Own intake batches only. Deep link: /intake",
    };
  }

  if (name === "get_my_intake_candidates") {
    const candidates = await listOpenIntakeReviews(dealerId);
    return {
      ok: true,
      count: candidates.length,
      candidates: candidates.map((c) => ({
        id: c.id,
        batchId: c.batchId,
        status: c.status,
        reviewStatus: c.reviewStatus,
        detectedPlate: c.detectedPlate,
        missingFields: c.missingFields,
        plateIdentityState: derivePlateIdentityState({
          plateNormalized: c.plateNormalized,
          govState: c.govState,
        }),
        confidenceBand: c.confidenceBand,
        existingVehicleId: c.existingVehicleId,
        batchStatus: c.batch.status,
      })),
      note: "Candidates needing review for THIS dealer only. Resolve via propose_mutation INTAKE.",
    };
  }

  if (name === "get_my_intake_candidate") {
    const candidateId = String(args.candidateId ?? "");
    if (!candidateId) return { ok: false, error: "candidateId_required" };
    const c = await prisma.vehicleCandidate.findFirst({
      where: { id: candidateId, dealerId },
      include: {
        batch: { select: { id: true, status: true, source: true, receivedAt: true } },
        media: {
          include: { media: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!c) return { ok: false, error: "not_found" };
    return {
      ok: true,
      candidate: {
        id: c.id,
        batchId: c.batchId,
        status: c.status,
        reviewStatus: c.reviewStatus,
        detectedPlate: c.detectedPlate,
        plateNormalized: c.plateNormalized,
        govState: c.govState,
        govIdentity: c.govIdentityJson,
        commercial: c.commercialJson,
        missingFields: c.missingFields,
        plateIdentityState: derivePlateIdentityState({
          plateNormalized: c.plateNormalized,
          govState: c.govState,
        }),
        existingVehicleId: c.existingVehicleId,
        confidenceBand: c.confidenceBand,
        batch: c.batch,
        mediaCount: c.media.length,
        media: c.media.map((m) => ({
          id: m.media.id,
          categoryHint: m.media.categoryHint,
          categoryConfidence: m.media.categoryConfidence,
        })),
      },
    };
  }

  if (name === "diagnose_my_search_matches") {
    const demandId = String(args.demandId ?? "");
    if (!demandId) return { ok: false, error: "demandId_required" };
    const result = await diagnoseDemandMatches(dealerId, demandId);
    if ("error" in result) return { ok: false, error: result.error };
    return {
      ok: true,
      diagnostic: result,
      note: "Privacy-safe aggregates only — no other-dealer identity. Present summaryHe in Hebrew; do not invent matches.",
    };
  }

  if (name === "get_my_attention_opportunities") {
    const { listAttentionOpportunities } = await import(
      "@/services/assistant/attention-opportunities"
    );
    const items = await listAttentionOpportunities(dealerId);
    return {
      ok: true,
      count: items.length,
      opportunities: items,
      note: "System flags only — do not invent urgency beyond these counts.",
    };
  }

  if (name === "get_my_customers") {
    const { listCustomersForDealer } = await import("@/services/customers");
    const customers = await listCustomersForDealer(dealerId, {
      take: typeof args.take === "number" ? args.take : 30,
    });
    return {
      ok: true,
      count: customers.length,
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        hasPhone: Boolean(c.normalizedPhone),
        demandCount: c.demands.length,
        demands: c.demands.map((d) => ({
          id: d.id,
          status: d.status,
          summary: d.rawText.slice(0, 120),
        })),
      })),
      note: "Own customers only. Phone digits are never returned to the model — ask UI if needed after Reveal rules.",
    };
  }

  if (name === "find_my_customer") {
    const { listCustomersForDealer } = await import("@/services/customers");
    const q = String(args.query ?? args.name ?? "").trim();
    if (!q) return { ok: false, error: "query_required" };
    const customers = await listCustomersForDealer(dealerId, { q, take: 10 });
    return {
      ok: true,
      count: customers.length,
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        hasPhone: Boolean(c.normalizedPhone),
        activeDemands: c.demands.map((d) => ({
          id: d.id,
          status: d.status,
          summary: d.rawText.slice(0, 160),
        })),
      })),
      note: "Never invent customer facts. Closing a demand does not delete the customer.",
    };
  }

  if (name === "get_network_intelligence") {
    const { getNetworkIntelligenceSnapshot, assertNetworkIntelSafe } =
      await import("@/services/network-intelligence");
    const snap = await getNetworkIntelligenceSnapshot({
      dealerId,
      make: typeof args.make === "string" ? args.make : null,
      model: typeof args.model === "string" ? args.model : null,
      yearMin: typeof args.yearMin === "number" ? args.yearMin : null,
      yearMax: typeof args.yearMax === "number" ? args.yearMax : null,
    });
    if (!assertNetworkIntelSafe(snap)) {
      return { ok: false, error: "privacy_guard_blocked" };
    }
    return {
      ok: true,
      intelligence: snap,
      note: "Anonymous aggregates only. If insufficientData, say there is not enough safe network data — never invent counts or identities.",
    };
  }

  if (name === "get_my_dealer_opportunities") {
    const { listOpenDealerOpportunities } = await import(
      "@/services/opportunities/dealer-opportunity"
    );
    const rows = await listOpenDealerOpportunities(dealerId);
    return {
      ok: true,
      count: rows.length,
      opportunities: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        priority: r.priority,
        vehicleId: r.vehicleId,
        demandId: r.demandId,
      })),
      note: "Proactive opportunities for THIS dealer. No cross-dealer identity.",
    };
  }

  return { ok: false, error: "unknown_tool" };
}

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("matching lifecycle hardening", () => {
  it("discovers from active demands instead of only existing CandidateMatch rows", () => {
    const code = source("src/services/matching/inventory-rematch.ts");
    expect(code).toContain('status: "ACTIVE"');
    expect(code).toContain('dealerId: { not: params.sellerDealerId }');
    expect(code).toContain("runMatchingForDemand");
    expect(code).not.toContain("candidateMatch.findMany");
  });

  it("rematches create, update and reactivation inventory mutations", () => {
    const create = source("src/services/inventory/create-vehicle.ts");
    const update = source("src/services/inventory/update-vehicle.ts");
    expect(create).toContain("rematchAfterInventoryMutation");
    expect(update).toContain("fulfillRequestsAfterVehicleUpdate");
    expect(update).toContain("rematchAfterInventoryMutation");
    expect(update).toContain("skipRematch?: boolean");
  });

  it("batches import discovery after all touched rows", () => {
    const code = source("src/services/inventory/import.ts");
    expect(code).toContain("skipRematch: true");
    expect(code).toContain("rematchInventoryBatch");
    expect(code).toContain("vehicleIds: [...touchedIds]");
  });

  it("renews expired demand TTL and rebuilds constraints before rematching", () => {
    const code = source("src/services/demand/demand-mutations.ts");
    expect(code).toContain("rebuildDemandConstraints");
    expect(code).toContain("expiresAt: computeDemandExpiry()");
    expect(code).toContain("legacyToSearchIntent(params.confirmed, constraints)");
  });

  it("requires live Qualified candidate state immediately before Reveal", () => {
    const code = source("src/services/commercial/reveal-flow.ts");
    expect(code).toContain("canPresentCandidateToBuyer");
    expect(code).toContain("REVEAL_CANDIDATE_INELIGIBLE");
    expect(code).toContain("match.demand.dealerId !== params.buyerDealerId");
    expect(code).toContain("match.vehicle.dealerId !== params.sellerDealerId");
  });

  it("keeps remote AI out of the synchronous matching hot path", () => {
    const explainer = source("src/services/ai/match-explainer.ts");
    const intelligence = source("src/services/exchange/intelligence-live.ts");
    expect(explainer).not.toContain("callOpenAIStructured");
    expect(intelligence).not.toContain("runExchangeIntelligenceShadow");
    expect(intelligence).toContain('mode: "fallback_deterministic"');
  });
});

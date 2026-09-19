import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Execution matrix (audit → final):
 * maybeOpportunityFromNetworkMatch | fire-and-forget | YES | awaited in matching-flow
 * maybeOpportunityFromDemandForMyVehicle | refresh-only / untracked | YES | awaited in matching-flow
 * reconcileCatalogForDealer (create/accept) | awaited | YES | awaited
 * reconcileCatalogPublicationForVehicle (rel/sold/archive) | await+swallow | YES | awaited
 * processIntakeBatch after ACK | untracked async | YES | durable via lifecycle catchup
 * recordActivationMilestone / logEvent / emit operational | fire-and-forget | NO | best-effort
 * processOutcomeReminders | fire-and-forget | NO | best-effort
 * deliverPushToUser | catch / skipIfNoSubscription | NO | best-effort (must not roll back)
 */
describe("product-critical async is tracked", () => {
  it("matching awaits opportunity persistence", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/domain/matching-flow.ts"),
      "utf8"
    );
    expect(src).toContain("await maybeOpportunityFromNetworkMatch");
    expect(src).toContain("await maybeOpportunityFromDemandForMyVehicle");
    expect(src).not.toContain("void maybeOpportunityFromNetworkMatch");
  });

  it("catalog reconcile after owned create/accept is awaited", () => {
    const create = readFileSync(
      join(process.cwd(), "src/services/inventory/create-vehicle.ts"),
      "utf8"
    );
    expect(create).toContain("await reconcileCatalogForDealer");
    expect(create).not.toContain("reconcileCatalogForDealer(input.dealerId).catch");
    const decision = readFileSync(
      join(process.cwd(), "src/services/decisions/vehicle-decision.ts"),
      "utf8"
    );
    expect(decision).toContain("await reconcileCatalogForDealer");
    expect(decision).not.toContain(
      "reconcileCatalogForDealer(input.dealerId).catch"
    );
  });
});

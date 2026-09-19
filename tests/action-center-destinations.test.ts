import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deepLinkForCatalogLead,
  deepLinkForDealerOpportunity,
  deepLinkForMatch,
  deepLinkForOpportunity,
  deepLinkForValidation,
} from "@/lib/deep-links";

function routerSrc() {
  return readFileSync(
    join(
      process.cwd(),
      "../../REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/App/AppRouter.swift"
    ),
    "utf8"
  );
}

describe("Action Center exact destinations", () => {
  it("emits entity-specific hrefs", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/actions/action-center.ts"),
      "utf8"
    );
    expect(src).toContain("`/matches/${row.id}`");
    expect(src).toContain("`/opportunities/${row.id}`");
    expect(src).toContain("`/dealer-opportunities/${row.id}`");
    expect(src).toContain("`/validations/${row.id}`");
    expect(src).toContain("`/catalog/leads/${row.id}`");
    expect(src).toContain("`/matches/${row.candidateMatchId}`");
    expect(src).not.toContain("/customers?lead=");
    expect(src).not.toContain("/inventory?enrich=1");
    expect(src).not.toContain("/validations?focus=${row.vehicleId}");
  });

  it("canonical builders match Action Center", () => {
    expect(deepLinkForMatch("m1")).toBe("/matches/m1");
    expect(deepLinkForOpportunity("o1")).toBe("/opportunities/o1");
    expect(deepLinkForDealerOpportunity("d1")).toBe("/dealer-opportunities/d1");
    expect(deepLinkForValidation("v1")).toBe("/validations/v1");
    expect(deepLinkForCatalogLead("l1")).toBe("/catalog/leads/l1");
  });

  it("Mobile DeepLink parses exact Action Center hrefs", () => {
    const swift = routerSrc();
    expect(swift).toContain("case opportunityDetail(String)");
    expect(swift).toContain("case dealerOpportunityDetail(String)");
    expect(swift).toContain("case validationDetail(String)");
    expect(swift).toContain("case catalogLead(String)");
    expect(swift).toContain('parts[1].lowercased() == "leads"');
    expect(swift).toContain("return .opportunityDetail(parts[1])");
    expect(swift).toContain("return .validationDetail(parts[1])");
    expect(swift).toContain("return .catalogLead(parts[2])");
    expect(swift).toContain("OpportunitiesInboxView(initialFocusId: id)");
    expect(swift).toContain("ValidationsView(initialFocusId: id)");
    expect(swift).toContain("CatalogInsightsView(initialLeadId: id)");
    expect(swift).toContain('queryValue(raw, key: "lead")');
  });
});

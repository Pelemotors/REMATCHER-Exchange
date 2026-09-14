import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Phase 2 — My Searches + match results", () => {
  it("demand list is search-first rows without dashboard chrome", () => {
    const client = readFileSync(
      join(root, "src/components/demand/demand-page-client.tsx"),
      "utf8"
    );
    expect(client).toContain("החיפושים שלי");
    expect(client).toContain("+ חיפוש חדש");
    expect(client).toContain("נמצאו");
    expect(client).toContain("החיפוש פעיל. REMATCHER עדיין מחפשת ברשת.");
    expect(client).toContain("מתאים לי");
    expect(client).not.toContain("SnapshotBar");
    expect(client).not.toContain("AttentionList");
    expect(client).not.toContain("scoreBand");
    expect(client).not.toContain("MatchCardV2");
  });

  it("matches API accepts demandId filter via listBuyerMatches", () => {
    const api = readFileSync(
      join(root, "src/app/api/matches/route.ts"),
      "utf8"
    );
    const list = readFileSync(
      join(root, "src/services/matching/list-buyer-matches.ts"),
      "utf8"
    );
    expect(api).toContain('searchParams.get("demandId")');
    expect(list).toContain("demandId");
    expect(list).toContain("BUYER_VISIBLE_MATCH_WHERE");
    expect(list).toContain("toBuyerMatchView");
  });

  it("demand authorized counts use buyer-visible policy", () => {
    const queries = readFileSync(
      join(root, "src/services/demand/demand-queries.ts"),
      "utf8"
    );
    expect(queries).toContain("BUYER_VISIBLE_MATCH_WHERE");
  });

  it("privacy view still omits seller identity and price", () => {
    const privacy = readFileSync(
      join(root, "src/lib/privacy-views.ts"),
      "utf8"
    );
    expect(privacy).toContain("Explicitly omit: b2bPrice");
    expect(privacy).not.toMatch(/dealerId:\s*vehicle\.dealerId/);
  });
});

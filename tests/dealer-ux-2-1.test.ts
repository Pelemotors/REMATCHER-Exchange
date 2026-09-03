import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  commercialStateLabel,
  EMPTY_COPY,
  interestLane,
  matchLaneLabel,
  vehiclePrimaryState,
} from "@/lib/commercial-ux";
import {
  demandStatusLabel,
  computeDemandUxStatus,
} from "@/lib/demand-display";

const root = join(__dirname, "..");

describe("commercial UX vocabulary", () => {
  it("maps primary states to Hebrew commercial labels", () => {
    expect(commercialStateLabel("needs_action")).toBe("דורש פעולה");
    expect(commercialStateLabel("waiting_other_side")).toBe("ממתין לצד השני");
    expect(commercialStateLabel("network_searching")).toBe("הרשת מחפשת");
    expect(commercialStateLabel("connection_created")).toBe("נוצר חיבור");
  });

  it("prioritizes validation over interest for vehicle primary state", () => {
    const state = vehiclePrimaryState({
      status: "ACTIVE",
      freshnessState: "STALE",
      hasInterest: true,
      missingB2b: true,
    });
    expect(state.primary).toBe("needs_validation");
  });

  it("groups match interest into action/waiting/history lanes", () => {
    expect(interestLane(null)).toBe("action");
    expect(interestLane("NO_RESPONSE")).toBe("action");
    expect(interestLane("INTERESTED")).toBe("waiting");
    expect(interestLane("REJECTED")).toBe("history");
  });

  it("exposes match lane labels", () => {
    expect(matchLaneLabel("action")).toBe("דורש ממני פעולה");
    expect(matchLaneLabel("waiting")).toBe("ממתין לצד השני");
  });

  it("uses commercial empty copy", () => {
    expect(EMPTY_COPY.matches.description).toContain("ממשיך לבדוק");
    expect(EMPTY_COPY.demandActivated.title).toBe("החיפוש הופעל");
    expect(EMPTY_COPY.inventoryFilter.title).toContain("סינון");
  });
});

describe("demand status commercial language", () => {
  it("labels expiring as מסתיים בקרוב", () => {
    expect(demandStatusLabel("EXPIRING")).toBe("מסתיים בקרוב");
  });

  it("computes EXPIRING within one day", () => {
    const soon = new Date(Date.now() + 12 * 60 * 60 * 1000);
    expect(computeDemandUxStatus("ACTIVE", soon)).toBe("EXPIRING");
  });
});

describe("dealer UX 2.1 product-flow guards", () => {
  it("does not redirect to empty matches after create demand", () => {
    const src = readFileSync(
      join(root, "src/components/demand/create-demand-flow.tsx"),
      "utf8"
    );
    expect(src).not.toContain('router.push("/matches")');
    expect(src).toContain('setStep("done")');
    expect(src).toContain("immediateMatchCount");
    expect(src).toContain("חזור לחיפושים");
  });

  it("does not concatenate demand reflections into a summary block", () => {
    const src = readFileSync(
      join(root, "src/app/(dealer)/demand/page.tsx"),
      "utf8"
    );
    expect(src).not.toContain("סיכום החיפושים הפעילים");
    expect(src).not.toContain(".map((d) => d.reflection).join");
    expect(src).toContain("SnapshotBar");
    expect(src).toContain("דורשים תשומת לב");
  });

  it("matches page defaults to action queue tabs", () => {
    const src = readFileSync(
      join(root, "src/app/(dealer)/matches/page.tsx"),
      "utf8"
    );
    expect(src).toContain('get("tab")');
    expect(src).toContain('"action"');
    expect(src).toContain("interestLane");
    expect(src).toContain("ממתין לצד השני");
  });

  it("reveal de-emphasizes immediate outcome and prioritizes WhatsApp", () => {
    const src = readFileSync(
      join(root, "src/app/(dealer)/reveals/[id]/page.tsx"),
      "utf8"
    );
    expect(src).toContain("פתח WhatsApp");
    expect(src).toContain("דברו ביניכם");
    expect(src).toContain("עדכון תוצאה (אופציונלי)");
    expect(src).toContain("showOutcome");
  });

  it("inventory opens agent in create_inventory context", () => {
    const src = readFileSync(
      join(root, "src/app/(dealer)/inventory/page.tsx"),
      "utf8"
    );
    expect(src).toContain('mode: "create_inventory"');
    expect(src).toContain("הוסף עם הסוכן");
    expect(src).toContain("SnapshotBar");
    expect(src).toContain("דורש טיפול");
  });

  it("validations explain why now commercially", () => {
    const src = readFileSync(
      join(root, "src/app/(dealer)/validations/page.tsx"),
      "utf8"
    );
    expect(src).toContain("whyNow");
    expect(src).toContain("יש ביקוש שעשוי להתאים");
    expect(src).toContain("כן, עדיין זמין");
  });

  it("activity separates action inbox from timeline and admin", () => {
    const src = readFileSync(
      join(root, "src/app/(dealer)/activity/page.tsx"),
      "utf8"
    );
    expect(src).toContain("דורש פעולה");
    expect(src).toContain("מה קרה");
    expect(src).toContain("הודעות REMATCHER");
    expect(src).toContain("notifications ??");
  });

  it("assistant bootstrap is route-aware", () => {
    const src = readFileSync(
      join(root, "src/components/assistant/exchange-assistant.tsx"),
      "utf8"
    );
    expect(src).toContain("routeAssistantBootstrap");
    expect(src).toContain("focusedObject");
    expect(src).toContain("/inventory");
    expect(src).toContain("/matches");
  });

  it("home deep-links into filtered opportunity surfaces", () => {
    const src = readFileSync(
      join(root, "src/components/home/home-v2.tsx"),
      "utf8"
    );
    expect(src).toContain("/matches?tab=action");
    expect(src).toContain("/opportunities?source=inventory");
  });
});

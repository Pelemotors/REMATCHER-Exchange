import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  isSoldIntent,
  isUpdateIntent,
  matchVehiclesFromText,
  parseB2bUpdate,
  type InventoryCandidate,
} from "@/services/inventory/lookup";
import { isConfirmation } from "@/services/assistant/conversation-state";
import { isSkipAnswer } from "@/services/assistant/inventory-draft";
import { heuristicPlan } from "@/services/assistant/planner";

const root = join(__dirname, "..");

const candidates: InventoryCandidate[] = [
  {
    id: "v1",
    make: "Toyota",
    model: "Corolla",
    year: 2022,
    mileage: 62000,
    b2bPrice: 134000,
    retailPrice: 139000,
    status: "ACTIVE",
  },
  {
    id: "v2",
    make: "Toyota",
    model: "Corolla",
    year: 2021,
    mileage: 91000,
    b2bPrice: 120000,
    retailPrice: null,
    status: "ACTIVE",
  },
  {
    id: "v3",
    make: "Mazda",
    model: "CX-5",
    year: 2023,
    mileage: 48000,
    b2bPrice: 134000,
    retailPrice: null,
    status: "ACTIVE",
  },
];

describe("inventory lookup / intents", () => {
  it("detects sold intent", () => {
    expect(isSoldIntent("הקורולה נמכרה")).toBe(true);
    expect(isSoldIntent("תוריד את הטוסון מהמלאי")).toBe(true);
    expect(isSoldIntent("קורולה 22 62 אלף")).toBe(false);
  });

  it("detects update intent without treating B2B listing as update", () => {
    expect(isUpdateIntent("תעדכן את ה-CX5 ל-129 B2B")).toBe(true);
    expect(isUpdateIntent("קורולה 22, 62 אלף, 139 אלף, B2B 134")).toBe(false);
  });

  it("parses B2B update amounts", () => {
    expect(parseB2bUpdate("תעדכן ל-129 B2B")).toBe(129000);
    expect(parseB2bUpdate("B2B 134000")).toBe(134000);
  });

  it("disambiguates multiple Corolla matches", () => {
    const matches = matchVehiclesFromText("הקורולה נמכרה", candidates);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.every((m) => m.model === "Corolla")).toBe(true);
  });

  it("matches single CX-5", () => {
    const matches = matchVehiclesFromText("תעדכן את ה-CX5 ל-129 B2B", candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("v3");
  });

  it("returns empty when no vehicle found", () => {
    expect(matchVehiclesFromText("הספורטאז נמכר", candidates)).toHaveLength(0);
  });
});

describe("confirmation language", () => {
  it("accepts שמור במלאי and כן נמכרה", () => {
    expect(isConfirmation("שמור במלאי")).toBe(true);
    expect(isConfirmation("כן, נמכרה")).toBe(true);
    expect(isConfirmation("עדכן")).toBe(true);
  });

  it("accepts תמשיך בלי as skip", () => {
    expect(isSkipAnswer("תמשיך בלי")).toBe(true);
  });
});

describe("planner inventory management heuristics", () => {
  it("routes sold language to mark_sold", () => {
    expect(heuristicPlan("הקורולה נמכרה").actionIntent).toBe("mark_sold");
  });

  it("routes update language to update_inventory", () => {
    expect(heuristicPlan("תעדכן את המחיר ל-129 b2b").actionIntent).toBe(
      "update_inventory"
    );
  });
});

describe("shared domain mutation path guards", () => {
  it("markMyVehicleSold uses markVehicleSoldForDealer", () => {
    const src = readFileSync(
      join(root, "src/services/assistant/tools/action-tools.ts"),
      "utf8"
    );
    expect(src).toContain("markVehicleSoldForDealer");
    expect(src).not.toMatch(
      /export async function markMyVehicleSold[\s\S]*prisma\.vehicle\.update\(/
    );
  });

  it("inventory PATCH uses domain mark-sold and update services", () => {
    const src = readFileSync(
      join(root, "src/app/api/inventory/route.ts"),
      "utf8"
    );
    expect(src).toContain("markVehicleSoldForDealer");
    expect(src).toContain("updateVehicleForDealer");
    expect(src).toContain("createVehicleForDealer");
  });

  it("inventory manage uses domain update/sold", () => {
    const src = readFileSync(
      join(root, "src/services/assistant/inventory-manage.ts"),
      "utf8"
    );
    expect(src).toContain("markVehicleSoldForDealer");
    expect(src).toContain("updateVehicleForDealer");
    expect(src).not.toContain("prisma.vehicle.update");
  });
});

describe("embedded inventory workspace UX guards", () => {
  it("inventory page embeds workspace and sold confirmation", () => {
    const src = readFileSync(
      join(root, "src/app/(dealer)/inventory/page.tsx"),
      "utf8"
    );
    expect(src).toContain("InventoryAgentWorkspace");
    expect(src).toContain("ניהול מלאי");
    expect(src).toContain("סמן כנמכר");
    expect(src).toContain("כן, נמכרה");
    expect(src).not.toContain("הוסף ונרמל");
    expect(src).not.toContain("openAgentInventory");
  });

  it("workspace uses inventory_management mode and not global bottomsheet", () => {
    const src = readFileSync(
      join(root, "src/components/inventory/inventory-agent-workspace.tsx"),
      "utf8"
    );
    expect(src).toContain('mode: "inventory_management"');
    expect(src).toContain("שלח לסוכן");
    expect(src).toContain("העלאת קובץ");
    expect(src).toContain("InventoryImportPanel");
  });

  it("hides global FAB while inventory workspace is open", () => {
    const src = readFileSync(
      join(root, "src/components/assistant/exchange-assistant.tsx"),
      "utf8"
    );
    expect(src).toContain("INVENTORY_WORKSPACE_EVENT");
    expect(src).toContain("hideFab");
  });
});

describe("markVehicleSoldForDealer domain", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exports shared mark sold service", async () => {
    const mod = await import("@/services/inventory/mark-sold");
    expect(typeof mod.markVehicleSoldForDealer).toBe("function");
  });

  it("exports shared update service", async () => {
    const mod = await import("@/services/inventory/update-vehicle");
    expect(typeof mod.updateVehicleForDealer).toBe("function");
  });
});

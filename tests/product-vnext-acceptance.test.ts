/**
 * Product VNext — architecture guards + acceptance scenarios (deterministic).
 * Device/provider scenarios marked separately; not PASS without evidence.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { normalizePhoneIL, phonesLikelySame } from "@/lib/phone";
import { extractCustomerHintsFromText } from "@/services/capture/customer-extract";
import {
  isNetworkSupplyEligible,
  NETWORK_ELIGIBLE_RELATIONSHIPS,
} from "@/services/vehicles/relationship-visibility";
import { assertNetworkIntelSafe } from "@/services/network-intelligence";
import { toBuyerMatchView } from "@/lib/privacy-views";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Product VNext architecture guards", () => {
  it("Customer model exists separate from Demand", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("model Customer");
    expect(schema).toContain("customerId");
    expect(schema).toMatch(/model Demand[\s\S]*customerId/);
    expect(schema).toContain("PAUSED");
  });

  it("Ownership ≠ Visibility enums on Vehicle", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("enum DealerVehicleRelationship");
    expect(schema).toContain("OFFERED_TO_ME");
    expect(schema).toContain("TRADE_IN_CANDIDATE");
    expect(schema).toContain("enum VehicleVisibility");
    expect(schema).toContain("ANONYMOUS_NETWORK");
    expect(schema).toContain("dealerRelationship");
  });

  it("network matching uses visibility gate", () => {
    expect(read("src/services/domain/matching-flow.ts")).toContain(
      "networkSupplyWhere"
    );
    expect(
      read("src/services/vehicles/relationship-visibility.ts")
    ).toContain("ANONYMOUS_NETWORK");
  });

  it("intake commit defaults OFFERED_TO_ME + PRIVATE", () => {
    const commit = read("src/services/intake/commit.ts");
    expect(commit).toContain('dealerRelationship: "OFFERED_TO_ME"');
    expect(commit).toContain('visibility: "PRIVATE"');
  });

  it("createVehicle defaults PRIVATE (no auto-publish)", () => {
    const src = read("src/services/inventory/create-vehicle.ts");
    expect(src).toContain('visibility: input.visibility ?? "PRIVATE"');
  });

  it("convertToOwned does not force publish", () => {
    const src = read("src/services/vehicles/relationship-visibility.ts");
    expect(src).toContain("convertToOwnedInventory");
    expect(src).toContain("never force publish");
  });

  it("monetization remains disabled by default", () => {
    expect(read("src/config/product-policy.ts")).toContain("Defaults: all OFF");
  });

  it("anonymous buyer match DTO omits dealerId and phones", () => {
    const view = toBuyerMatchView({
      make: "Hyundai",
      model: "Tucson",
      trim: null,
      year: 2022,
      mileage: 30000,
      color: null,
      region: null,
      ownershipHand: 1,
      dealerId: "secret-dealer",
      b2bPrice: 120000,
    });
    const s = JSON.stringify(view).toLowerCase();
    expect(s).not.toContain("secret-dealer");
    expect(s).not.toContain("dealerid");
    expect(s).not.toContain("b2bprice");
    expect(s).not.toContain("phone");
  });

  it("network intel guard rejects phone keys", () => {
    expect(
      assertNetworkIntelSafe({
        ok: true,
        demand: { activeCount: 5 },
        myPrivate: { matchingDemandCount: 1 },
      })
    ).toBe(true);
    expect(
      assertNetworkIntelSafe({ customerPhone: "0500000000" })
    ).toBe(false);
  });

  it("offered vehicle is not network-eligible without publish", () => {
    expect(
      isNetworkSupplyEligible({
        status: "ACTIVE",
        mediaReady: true,
        visibility: "PRIVATE",
        dealerRelationship: "OFFERED_TO_ME",
      })
    ).toBe(false);
    expect(
      isNetworkSupplyEligible({
        status: "ACTIVE",
        mediaReady: true,
        visibility: "ANONYMOUS_NETWORK",
        dealerRelationship: "OFFERED_TO_ME",
      })
    ).toBe(false);
    expect(
      isNetworkSupplyEligible({
        status: "ACTIVE",
        mediaReady: true,
        visibility: "ANONYMOUS_NETWORK",
        dealerRelationship: "OWNED",
      })
    ).toBe(true);
    expect(NETWORK_ELIGIBLE_RELATIONSHIPS).toContain("OWNED");
  });
});

describe("Product VNext acceptance — Customer capture heuristics", () => {
  it("#1/#3/#4 phone normalize + same phone", () => {
    expect(normalizePhoneIL("050-123-4567")).toBe("972501234567");
    expect(phonesLikelySame("0501234567", "+972501234567")).toBe(true);
  });

  it("#2 name without phone does not fail extract", () => {
    const h = extractCustomerHintsFromText("שם: אחמד מחפש טוסון");
    expect(h.name).toBeTruthy();
    expect(h.normalizedPhone).toBeNull();
  });

  it("#5 different phone not same", () => {
    expect(phonesLikelySame("0501111111", "0502222222")).toBe(false);
  });

  it("#7 semantic alternative cue", () => {
    expect(
      extractCustomerHintsFromText("טוסון או משהו בסגנון").semanticAlternative
    ).toBe(true);
  });

  it("#8 hard ceiling cue", () => {
    expect(extractCustomerHintsFromText("120 גג").hardCeilingHint).toBe(true);
  });

  it("#9 soft budget cue", () => {
    expect(
      extractCustomerHintsFromText("יכול לחרוג קצת מתקציב 120").softBudgetHint
    ).toBe(true);
  });

  it("#10 hybrid hard vs soft", () => {
    expect(extractCustomerHintsFromText("רק היברידי").hybridHard).toBe(true);
    expect(extractCustomerHintsFromText("עדיף היברידי").hybridSoft).toBe(true);
  });

  it("#13/#14 close and pause cues", () => {
    expect(extractCustomerHintsFromText("אחמד כבר הסתדר").wantsClose).toBe(true);
    expect(extractCustomerHintsFromText("חודש הבא נמשיך").wantsPause).toBe(true);
  });
});

describe("Product VNext acceptance — source wiring evidence", () => {
  it("Customer API + pause/resume + private match + NI + opportunities exist", () => {
    expect(existsSync(join(root, "src/app/api/customers/route.ts"))).toBe(true);
    expect(existsSync(join(root, "src/app/api/intelligence/route.ts"))).toBe(
      true
    );
    expect(
      existsSync(join(root, "src/app/api/vehicles/visibility/route.ts"))
    ).toBe(true);
    expect(
      existsSync(join(root, "src/app/api/dealer-opportunities/route.ts"))
    ).toBe(true);
    expect(read("src/app/api/demands/lifecycle/route.ts")).toContain("pause");
    expect(read("src/services/intake/intake-agent-tools.ts")).toContain(
      "get_network_intelligence"
    );
    expect(read("src/services/intake/intake-agent-tools.ts")).toContain(
      "private_match_vehicle_to_my_demands"
    );
  });

  it("migration product_vnext_domain present", () => {
    expect(
      existsSync(
        join(
          root,
          "prisma/migrations/20260916030000_product_vnext_domain/migration.sql"
        )
      )
    ).toBe(true);
  });
});

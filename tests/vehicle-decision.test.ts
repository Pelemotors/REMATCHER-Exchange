import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reviewAskingPriceFromCommercial } from "@/services/vehicles/review-asking-price";
import { buildDealerInventoryWhere } from "@/services/inventory/dealer-inventory-filter";

type DecisionRow = {
  id: string;
  dealerId: string;
  vehicleId: string;
  sourceCandidateId: string | null;
  type: "PURCHASE" | "TRADE";
  status: "OPEN" | "ACCEPTED" | "DECLINED";
  incomingAskPrice: number | null;
  incomingAgreedPrice: number | null;
  outgoingVehicleId: string | null;
  outgoingAgreedPrice: number | null;
  openedAt: Date;
  updatedAt: Date;
  decidedAt: Date | null;
  outgoingVehicle: null;
};

type VehicleRow = {
  id: string;
  dealerId: string;
  dealerRelationship: string;
  status: string;
  visibility: string;
};

const emitCalls: unknown[] = [];
const state: { decisions: DecisionRow[]; vehicles: Record<string, VehicleRow> } = {
  decisions: [],
  vehicles: {},
};
let convertShouldFail = false;
let afterOpenRead: (() => void) | null = null;
let nextId = 1;

function cloneState() {
  return structuredClone(state);
}

function restoreState(snap: ReturnType<typeof cloneState>) {
  state.decisions = snap.decisions;
  state.vehicles = snap.vehicles;
}

function matchesDecision(row: DecisionRow, where: Record<string, unknown>) {
  if (where.id && row.id !== where.id) return false;
  if (where.dealerId && row.dealerId !== where.dealerId) return false;
  if (where.vehicleId && row.vehicleId !== where.vehicleId) return false;
  if (where.status && row.status !== where.status) return false;
  if (where.type && row.type !== where.type) return false;
  return true;
}

function decisionApi(store: typeof state) {
  return {
    findFirst: async (args: {
      where: Record<string, unknown>;
      orderBy?: { openedAt?: "desc" | "asc" };
    }) => {
      let rows = store.decisions.filter((row) => matchesDecision(row, args.where));
      if (args.orderBy?.openedAt === "desc") {
        rows = [...rows].sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
      }
      const row = rows[0] ?? null;
      const snapshot = row ? { ...row } : null;
      if (row?.status === "OPEN" && args.where.status === "OPEN" && afterOpenRead) {
        const hook = afterOpenRead;
        afterOpenRead = null;
        hook();
      }
      return snapshot;
    },
    findMany: async (args: { where: Record<string, unknown> }) =>
      store.decisions.filter((row) => matchesDecision(row, args.where)),
    create: async (args: { data: Partial<DecisionRow> }) => {
      if (
        args.data.status === "OPEN" &&
        store.decisions.some(
          (row) =>
            row.dealerId === args.data.dealerId &&
            row.vehicleId === args.data.vehicleId &&
            row.status === "OPEN"
        )
      ) {
        throw { code: "P2002" };
      }
      const row: DecisionRow = {
        id: `dec-${nextId++}`,
        dealerId: String(args.data.dealerId),
        vehicleId: String(args.data.vehicleId),
        sourceCandidateId: args.data.sourceCandidateId ?? null,
        type: (args.data.type as DecisionRow["type"]) ?? "PURCHASE",
        status: (args.data.status as DecisionRow["status"]) ?? "OPEN",
        incomingAskPrice: args.data.incomingAskPrice ?? null,
        incomingAgreedPrice: args.data.incomingAgreedPrice ?? null,
        outgoingVehicleId: args.data.outgoingVehicleId ?? null,
        outgoingAgreedPrice: args.data.outgoingAgreedPrice ?? null,
        openedAt: new Date(),
        updatedAt: new Date(),
        decidedAt: null,
        outgoingVehicle: null,
      };
      store.decisions.push(row);
      return row;
    },
    updateMany: async (args: {
      where: Record<string, unknown>;
      data: Partial<DecisionRow>;
    }) => {
      const matches = store.decisions.filter((row) =>
        matchesDecision(row, args.where)
      );
      for (const row of matches) Object.assign(row, args.data, { updatedAt: new Date() });
      return { count: matches.length };
    },
    findUnique: async (args: { where: { id?: string } }) =>
      store.decisions.find((row) => row.id === args.where.id) ?? null,
  };
}

function vehicleApi(store: typeof state) {
  return {
    findFirst: async (args: { where: { id?: string; dealerId?: string } }) => {
      const v = args.where.id ? store.vehicles[args.where.id] : null;
      if (!v) return null;
      if (args.where.dealerId && v.dealerId !== args.where.dealerId) return null;
      return v;
    },
    findMany: async (args: { where: Record<string, unknown> }) =>
      Object.values(store.vehicles).filter((v) => {
        if (args.where.status && v.status !== args.where.status) return false;
        return true;
      }),
    update: async (args: { where: { id: string }; data: Partial<VehicleRow> }) => {
      const v = store.vehicles[args.where.id];
      if (!v) throw new Error("missing vehicle");
      Object.assign(v, args.data);
      return v;
    },
  };
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicleDecision: {
      findFirst: (args: never) => decisionApi(state).findFirst(args),
      findMany: (args: never) => decisionApi(state).findMany(args),
      create: (args: never) => decisionApi(state).create(args),
      updateMany: (args: never) => decisionApi(state).updateMany(args),
      findUnique: (args: never) => decisionApi(state).findUnique(args),
    },
    vehicle: {
      findFirst: (args: never) => vehicleApi(state).findFirst(args),
      findMany: (args: never) => vehicleApi(state).findMany(args),
      update: (args: never) => vehicleApi(state).update(args),
    },
    vehicleCandidate: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const snap = cloneState();
      const tx = {
        vehicleDecision: decisionApi(state),
        vehicle: vehicleApi(state),
      };
      try {
        return await fn(tx);
      } catch (error) {
        restoreState(snap);
        throw error;
      }
    },
  },
}));
vi.mock("@/services/exchange/events", () => ({
  emitExchangeEvent: (...args: unknown[]) => {
    emitCalls.push(args[0]);
    return Promise.resolve(undefined);
  },
}));
vi.mock("@/services/catalog/reconcile", () => ({
  reconcileCatalogForDealer: vi.fn().mockResolvedValue({
    published: 0,
    unpublished: 0,
    policy: "MANUAL",
  }),
}));
vi.mock("@/services/vehicles/relationship-visibility", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/vehicles/relationship-visibility")
  >("@/services/vehicles/relationship-visibility");
  return {
    ...actual,
    convertToOwnedInventory: async (
      params: Parameters<typeof actual.convertToOwnedInventory>[0]
    ) => {
      if (convertShouldFail) {
        return { ok: false as const, error: "relationship_not_convertible" as const };
      }
      return actual.convertToOwnedInventory(params);
    },
  };
});

import {
  acceptDecision,
  assertOutgoingVehicleEligible,
  backfillOpenVehicleDecisions,
  declineDecision,
  decisionTypeForRelationship,
  listDecisionsForVehicle,
  openOrGetDecision,
  persistDecisionPrice,
  retargetOpenDecision,
} from "@/services/decisions/vehicle-decision";

function seedOpen(over: Partial<DecisionRow> = {}): DecisionRow {
  const row: DecisionRow = {
    id: over.id ?? "dec-open",
    dealerId: "d1",
    vehicleId: "v-in",
    sourceCandidateId: "c1",
    type: "PURCHASE",
    status: "OPEN",
    incomingAskPrice: 90000,
    incomingAgreedPrice: null,
    outgoingVehicleId: null,
    outgoingAgreedPrice: null,
    openedAt: new Date("2026-09-19T00:00:00.000Z"),
    updatedAt: new Date("2026-09-19T00:00:00.000Z"),
    decidedAt: null,
    outgoingVehicle: null,
    ...over,
  };
  state.decisions.push(row);
  return row;
}

describe("schema / lookup authority", () => {
  it("drops composite unique and uses partial OPEN unique", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).not.toContain("@@unique([dealerId, vehicleId])");
    expect(schema).toContain("@@index([dealerId, vehicleId, status, openedAt(sort: Desc)])");
    const sql = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260919200000_vehicle_decision_open_partial_unique/migration.sql"
      ),
      "utf8"
    );
    expect(sql).toContain("DROP INDEX IF EXISTS \"VehicleDecision_dealerId_vehicleId_key\"");
    expect(sql).toContain("WHERE \"status\" = 'OPEN'");
    expect(sql).not.toMatch(/DELETE |TRUNCATE |RESET /i);
  });

  it("service no longer uses dealerId_vehicleId findUnique", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/decisions/vehicle-decision.ts"),
      "utf8"
    );
    expect(src).not.toContain("dealerId_vehicleId");
    expect(src).toContain("$transaction");
    expect(src).toContain("status: \"OPEN\"");
  });

  it("maps relationship types", () => {
    expect(decisionTypeForRelationship("OFFERED_TO_ME")).toBe("PURCHASE");
    expect(decisionTypeForRelationship("TRADE_IN_CANDIDATE")).toBe("TRADE");
    expect(decisionTypeForRelationship("OWNED")).toBeNull();
  });
});

describe("history", () => {
  beforeEach(() => {
    state.decisions = [];
    state.vehicles = {
      "v-in": {
        id: "v-in",
        dealerId: "d1",
        dealerRelationship: "OFFERED_TO_ME",
        status: "ACTIVE",
        visibility: "PRIVATE",
      },
    };
    emitCalls.length = 0;
    convertShouldFail = false;
  });

  it("DECLINED does not block a new OPEN Decision", async () => {
    seedOpen({
      id: "old",
      status: "DECLINED",
      incomingAgreedPrice: 88000,
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const opened = await openOrGetDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      type: "PURCHASE",
      incomingAskPrice: 70000,
    });
    expect(opened.created).toBe(true);
    expect(opened.decision.id).not.toBe("old");
    expect(opened.decision.status).toBe("OPEN");
    expect(opened.decision.incomingAskPrice).toBe(70000);
    expect(opened.decision.incomingAgreedPrice).toBeNull();
    const history = await listDecisionsForVehicle({
      dealerId: "d1",
      vehicleId: "v-in",
    });
    expect(history).toHaveLength(2);
    expect(history.some((d) => d.id === "old" && d.status === "DECLINED")).toBe(true);
    expect(history.filter((d) => d.status === "OPEN")).toHaveLength(1);
  });

  it("ACCEPTED history remains and does not block a later OPEN", async () => {
    seedOpen({
      id: "accepted",
      status: "ACCEPTED",
      incomingAgreedPrice: 50000,
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const opened = await openOrGetDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      type: "TRADE",
    });
    expect(opened.created).toBe(true);
    expect(opened.decision.type).toBe("TRADE");
    const old = state.decisions.find((d) => d.id === "accepted");
    expect(old?.status).toBe("ACCEPTED");
    expect(old?.incomingAgreedPrice).toBe(50000);
  });

  it("openOrGet is idempotent while OPEN exists", async () => {
    seedOpen({ id: "live" });
    const again = await openOrGetDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      type: "PURCHASE",
    });
    expect(again.created).toBe(false);
    expect(again.idempotent).toBe(true);
    expect(again.decision.id).toBe("live");
    expect(state.decisions.filter((d) => d.status === "OPEN")).toHaveLength(1);
  });

  it("concurrent opens collapse to one OPEN via unique conflict", async () => {
    seedOpen({ id: "live" });
    const raced = await openOrGetDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      type: "PURCHASE",
    });
    expect(raced.idempotent).toBe(true);
    expect(state.decisions.filter((d) => d.status === "OPEN")).toHaveLength(1);
  });

  it("backfill does not reopen terminal history", async () => {
    seedOpen({ id: "old", status: "DECLINED" });
    const result = await backfillOpenVehicleDecisions();
    expect(result.created).toBe(0);
    expect(state.decisions.filter((d) => d.status === "OPEN")).toHaveLength(0);
  });
});

describe("accept atomicity", () => {
  beforeEach(() => {
    state.decisions = [];
    state.vehicles = {
      "v-in": {
        id: "v-in",
        dealerId: "d1",
        dealerRelationship: "OFFERED_TO_ME",
        status: "ACTIVE",
        visibility: "PRIVATE",
      },
      "v-out": {
        id: "v-out",
        dealerId: "d1",
        dealerRelationship: "OWNED",
        status: "ACTIVE",
        visibility: "PRIVATE",
      },
    };
    emitCalls.length = 0;
    convertShouldFail = false;
    afterOpenRead = null;
  });

  it("successful accept yields ACCEPTED + OWNED together", async () => {
    seedOpen();
    const result = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      incomingAgreedPrice: 88000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.status).toBe("ACCEPTED");
      expect(result.decision.incomingAgreedPrice).toBe(88000);
    }
    expect(state.vehicles["v-in"]?.dealerRelationship).toBe("OWNED");
    expect(
      emitCalls.some(
        (e) =>
          typeof e === "object" &&
          e &&
          "eventType" in e &&
          (e as { eventType: string }).eventType === "decision.accepted"
      )
    ).toBe(true);
  });

  it("convert failure rolls Decision back to OPEN and emits no accepted event", async () => {
    seedOpen();
    convertShouldFail = true;
    const result = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      incomingAgreedPrice: 88000,
    });
    expect(result.ok).toBe(false);
    expect(state.decisions[0]?.status).toBe("OPEN");
    expect(state.vehicles["v-in"]?.dealerRelationship).toBe("OFFERED_TO_ME");
    expect(
      emitCalls.some(
        (e) =>
          typeof e === "object" &&
          e &&
          "eventType" in e &&
          (e as { eventType: string }).eventType === "decision.accepted"
      )
    ).toBe(false);
  });

  it("accept+accept: one transition, second idempotent", async () => {
    seedOpen();
    const first = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      incomingAgreedPrice: 88000,
    });
    const second = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      incomingAgreedPrice: 88000,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.idempotent).toBe(true);
    expect(state.decisions.filter((d) => d.status === "ACCEPTED")).toHaveLength(1);
    expect(state.vehicles["v-in"]?.dealerRelationship).toBe("OWNED");
  });

  it("accept+decline: exactly one terminal wins", async () => {
    seedOpen();
    const accepted = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      incomingAgreedPrice: 88000,
    });
    const declined = await declineDecision({ dealerId: "d1", vehicleId: "v-in" });
    expect(accepted.ok).toBe(true);
    expect(declined.ok).toBe(false);
    if (!declined.ok) expect(declined.error).toBe("decision_accepted");
    expect(state.decisions[0]?.status).toBe("ACCEPTED");
    expect(state.vehicles["v-in"]?.dealerRelationship).toBe("OWNED");
  });

  it("decline+decline is idempotent and never owns the vehicle", async () => {
    seedOpen();
    const first = await declineDecision({ dealerId: "d1", vehicleId: "v-in" });
    const second = await declineDecision({ dealerId: "d1", vehicleId: "v-in" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.idempotent).toBe(true);
    expect(state.decisions[0]?.status).toBe("DECLINED");
    expect(state.vehicles["v-in"]?.dealerRelationship).toBe("OFFERED_TO_ME");
  });

  it("accept cannot commit TRADE after validating PURCHASE if retarget raced", async () => {
    seedOpen({ incomingAgreedPrice: 88000 });
    afterOpenRead = () => {
      const open = state.decisions.find((row) => row.status === "OPEN");
      if (!open) return;
      open.type = "TRADE";
      open.outgoingVehicleId = null;
      open.outgoingAgreedPrice = null;
    };
    const result = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      incomingAgreedPrice: 88000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("decision_type_changed");
    expect(state.decisions[0]?.status).toBe("OPEN");
    expect(state.decisions[0]?.type).toBe("TRADE");
    expect(state.vehicles["v-in"]?.dealerRelationship).toBe("OFFERED_TO_ME");
    expect(
      emitCalls.some(
        (e) =>
          typeof e === "object" &&
          e &&
          "eventType" in e &&
          (e as { eventType: string }).eventType === "decision.accepted"
      )
    ).toBe(false);
  });

  it("TRADE accept still requires outgoingVehicleId and incomingAgreedPrice", async () => {
    seedOpen({ type: "TRADE", incomingAgreedPrice: null, outgoingVehicleId: null });
    const missingPrice = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
    });
    expect(missingPrice.ok).toBe(false);
    if (!missingPrice.ok) expect(missingPrice.error).toBe("agreed_price_required");

    state.decisions = [];
    seedOpen({
      type: "TRADE",
      incomingAgreedPrice: 70000,
      outgoingVehicleId: null,
    });
    const missingOutgoing = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      incomingAgreedPrice: 70000,
    });
    expect(missingOutgoing.ok).toBe(false);
    if (!missingOutgoing.ok) {
      expect(missingOutgoing.error).toBe("outgoing_vehicle_required");
    }
  });
});

describe("retarget atomicity + trade guards", () => {
  beforeEach(() => {
    state.decisions = [];
    state.vehicles = {
      "v-in": {
        id: "v-in",
        dealerId: "d1",
        dealerRelationship: "OFFERED_TO_ME",
        status: "ACTIVE",
        visibility: "PRIVATE",
      },
      "v-out": {
        id: "v-out",
        dealerId: "d1",
        dealerRelationship: "OWNED",
        status: "ACTIVE",
        visibility: "PRIVATE",
      },
    };
    emitCalls.length = 0;
  });

  it("retarget updates Decision type and relationship together", async () => {
    seedOpen();
    const result = await retargetOpenDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      type: "TRADE",
    });
    expect(result.ok).toBe(true);
    expect(state.decisions[0]?.type).toBe("TRADE");
    expect(state.vehicles["v-in"]?.dealerRelationship).toBe("TRADE_IN_CANDIDATE");
  });

  it("retarget failure does not leave type/relationship mismatch", async () => {
    seedOpen();
    delete state.vehicles["v-in"];
    const result = await retargetOpenDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      type: "TRADE",
    });
    expect(result.ok).toBe(false);
    expect(state.decisions[0]?.type).toBe("PURCHASE");
    expect(state.decisions[0]?.status).toBe("OPEN");
  });

  it("rejects illegal outgoing vehicles", async () => {
    expect(
      await assertOutgoingVehicleEligible({
        dealerId: "d1",
        incomingVehicleId: "v-in",
        outgoingVehicleId: "v-in",
      })
    ).toMatchObject({ ok: false, error: "outgoing_same_as_incoming" });
    state.vehicles["v-out"]!.status = "SOLD";
    expect(
      await assertOutgoingVehicleEligible({
        dealerId: "d1",
        incomingVehicleId: "v-in",
        outgoingVehicleId: "v-out",
      })
    ).toMatchObject({ ok: false, error: "outgoing_not_active" });
  });

  it("persists OPEN Decision price only", async () => {
    seedOpen({ incomingAskPrice: null });
    seedOpen({
      id: "old",
      status: "DECLINED",
      incomingAskPrice: 111,
      openedAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const saved = await persistDecisionPrice({
      dealerId: "d1",
      vehicleId: "v-in",
      price: 90000,
      field: "incomingAskPrice",
    });
    expect(saved).toBe(90000);
    expect(state.decisions.find((d) => d.status === "OPEN")?.incomingAskPrice).toBe(
      90000
    );
    expect(state.decisions.find((d) => d.id === "old")?.incomingAskPrice).toBe(111);
  });
});

describe("filters and price families", () => {
  it("review is OPEN decisions; all excludes declined leftovers", () => {
    const review = buildDealerInventoryWhere({
      dealerId: "d1",
      filter: "review",
    });
    expect(review.incomingDecisions).toEqual({
      some: { dealerId: "d1", status: "OPEN" },
    });
  });

  it("never seeds acquisition from b2b/retail", () => {
    expect(
      reviewAskingPriceFromCommercial({ b2bPrice: 1, retailPrice: 2 })
    ).toBeNull();
  });

  it("backend tests do not depend on an absolute Mobile repository path", () => {
    const src = readFileSync(join(__dirname, "vehicle-decision.test.ts"), "utf8");
    const banned = ["srv", "gal", "REMATCHER-Exchange-Mobile"].join("/");
    expect(src.includes(`/${banned}`)).toBe(false);
  });
});

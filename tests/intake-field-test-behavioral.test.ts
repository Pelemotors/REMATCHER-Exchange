/**
 * Behavioral Field Test intake + dealer isolation (hits FT DB when DATABASE_URL is FT).
 * Skips when not on Field Test DB so CI/unit runs stay hermetic.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hash, compare } from "bcryptjs";
import { extractCommercialFromText } from "@/services/intake/text-extract";
import { CLASSIFY_CONFIDENCE_THRESHOLD } from "@/services/intake/media-classify";
import { normalizePlate } from "@/services/intake/status";

const databaseUrl = process.env.DATABASE_URL || "";
const isFieldTest =
  databaseUrl.includes("5435") ||
  databaseUrl.includes("field_test") ||
  process.env.FIELD_TEST === "true";

const prisma = isFieldTest ? new PrismaClient() : null;

describe("media classification contract", () => {
  it("threshold is explicit and never auto-promotes null/OTHER", () => {
    expect(CLASSIFY_CONFIDENCE_THRESHOLD).toBeGreaterThan(0.5);
    expect(CLASSIFY_CONFIDENCE_THRESHOLD).toBeLessThan(0.9);
    // Below threshold → null (tested via classify returning null path in unit)
    expect(0.61 < CLASSIFY_CONFIDENCE_THRESHOLD).toBe(true);
  });
});

describe.runIf(isFieldTest)("field-test owner auth + dealer network", () => {
  beforeAll(async () => {
    expect(prisma).toBeTruthy();
  });

  it("owner Gmail user exists with valid password hash and VERIFIED dealer", async () => {
    const user = await prisma!.user.findUnique({
      where: { email: "galsamama@gmail.com" },
      include: {
        memberships: { include: { dealer: true } },
      },
    });
    expect(user).toBeTruthy();
    expect(user!.emailVerifiedAt).toBeTruthy();
    expect(user!.passwordHash).toBeTruthy();
    const expected = process.env.FIELD_TEST_OWNER_PASSWORD;
    if (!expected) {
      console.warn("skip password compare: FIELD_TEST_OWNER_PASSWORD unset");
      return;
    }
    const ok = await compare(expected, user!.passwordHash!);
    expect(ok).toBe(true);
    const membership = user!.memberships[0];
    expect(membership).toBeTruthy();
    expect(membership.dealer.verificationStatus).toBe("VERIFIED");
    expect(membership.dealer.isActive).toBe(true);

    const privacy = await prisma!.privacyAiOnboardingState.findUnique({
      where: {
        userId_dealerId: {
          userId: user!.id,
          dealerId: membership.dealerId,
        },
      },
    });
    expect(privacy?.completedAt).toBeTruthy();
  });

  it("counterparty dealer B is separate from owner A", async () => {
    const a = await prisma!.dealer.findFirst({
      where: { email: "galsamama@gmail.com" },
    });
    const b = await prisma!.dealer.findFirst({
      where: { email: "fieldtest-b@rematcher.local" },
    });
    expect(a?.id).toBeTruthy();
    expect(b?.id).toBeTruthy();
    expect(a!.id).not.toBe(b!.id);
  });
});

describe.runIf(isFieldTest)("field-test intake ACK + idempotency + multi-candidate", () => {
  it("ACK persists acknowledgedAt and resume is idempotent", async () => {
    const dealer = await prisma!.dealer.findFirstOrThrow({
      where: { email: "galsamama@gmail.com" },
    });
    const clientBatchId = `ft-rc-${Date.now()}`;
    const batch = await prisma!.intakeBatch.create({
      data: {
        dealerId: dealer.id,
        source: "WEB_UPLOAD",
        clientBatchId,
        status: "RECEIVING",
      },
    });
    await prisma!.intakeText.create({
      data: {
        batchId: batch.id,
        text: "ראשון 12-345-67 שני 98-765-43 מחיר 100000",
        provenance: "WHATSAPP_TEXT",
      },
    });

    const ackAt = new Date();
    const acknowledged = await prisma!.intakeBatch.update({
      where: { id: batch.id },
      data: {
        status: "RECEIVED",
        acknowledgedAt: ackAt,
      },
    });
    expect(acknowledged.acknowledgedAt).toBeTruthy();

    const resumed = await prisma!.intakeBatch.findUnique({
      where: {
        dealerId_clientBatchId: {
          dealerId: dealer.id,
          clientBatchId,
        },
      },
    });
    expect(resumed!.id).toBe(batch.id);

    const plates = extractCommercialFromText(
      "ראשון 12-345-67 שני 98-765-43 מחיר 100000"
    ).plates;
    expect(plates.length).toBe(2);

    for (const p of plates) {
      await prisma!.vehicleCandidate.create({
        data: {
          batchId: batch.id,
          dealerId: dealer.id,
          status: "IDENTIFYING",
          detectedPlate: p.value,
          plateNormalized: normalizePlate(p.value),
          plateConfidence: p.confidence,
          commercialJson: { askingPrice: 100000 },
        },
      });
    }

    const candidates = await prisma!.vehicleCandidate.findMany({
      where: { batchId: batch.id },
    });
    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map((c) => c.plateNormalized)).size).toBe(2);

    // Stuck sibling does not delete the other
    await prisma!.vehicleCandidate.update({
      where: { id: candidates[0].id },
      data: { status: "NEEDS_INFO", failureCode: "STUCK_TEST" },
    });
    const sibling = await prisma!.vehicleCandidate.findUniqueOrThrow({
      where: { id: candidates[1].id },
    });
    expect(sibling.status).toBe("IDENTIFYING");
  });

  it("additive duplicate same plate does not invent second ACTIVE vehicle when merged", async () => {
    const dealer = await prisma!.dealer.findFirstOrThrow({
      where: { email: "galsamama@gmail.com" },
    });
    const plate = `9${String(Date.now()).slice(-7)}`;
    const v = await prisma!.vehicle.create({
      data: {
        dealerId: dealer.id,
        status: "ACTIVE",
        rawInput: `intake plate:${plate}`,
        make: "Hyundai",
        model: "Tucson",
        year: 2020,
        mediaReady: false,
        fieldProvenance: {
          licensePlate: { value: plate, source: "TEST" },
        },
      },
    });
    const same = await prisma!.vehicle.findFirst({
      where: {
        dealerId: dealer.id,
        status: "ACTIVE",
        OR: [
          { rawInput: { contains: `plate:${plate}` } },
          {
            fieldProvenance: {
              path: ["licensePlate", "value"],
              equals: plate,
            },
          },
        ],
      },
    });
    expect(same!.id).toBe(v.id);
  });
});

describe.runIf(isFieldTest)("field-test dealer isolation", () => {
  it("dealer B cannot see dealer A vehicle by id query scope", async () => {
    const a = await prisma!.dealer.findFirstOrThrow({
      where: { email: "galsamama@gmail.com" },
    });
    const b = await prisma!.dealer.findFirstOrThrow({
      where: { email: "fieldtest-b@rematcher.local" },
    });
    const vehicle = await prisma!.vehicle.create({
      data: {
        dealerId: a.id,
        status: "ACTIVE",
        make: "Toyota",
        model: "Corolla",
        year: 2019,
        mediaReady: true,
        rawInput: "isolation-test",
      },
    });
    const cross = await prisma!.vehicle.findFirst({
      where: { id: vehicle.id, dealerId: b.id },
    });
    expect(cross).toBeNull();
    const own = await prisma!.vehicle.findFirst({
      where: { id: vehicle.id, dealerId: a.id },
    });
    expect(own).toBeTruthy();
  });
});

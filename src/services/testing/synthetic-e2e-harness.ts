/**
 * Isolated SYNTHETIC DB fixture for Field Test runtime E2E.
 * Refuses production / REAL market databases.
 */
import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

export const SYNTHETIC_E2E_EMAIL_PREFIX = "e2e-core+";
export const SYNTHETIC_E2E_COHORT = "SYNTHETIC_E2E";
export const SYNTHETIC_E2E_PASSWORD = "E2eCore!Synthetic1";

export type SyntheticIdentity = {
  tag: "A" | "B";
  userId: string;
  dealerId: string;
  email: string;
  accessToken: string;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function assertIsolatedFieldTestDatabase(url: string) {
  const isolated =
    url.includes("5435") &&
    (url.includes("field_test") || url.includes("rematcher_exchange_field_test"));
  const productionShaped = url.includes("5436");
  if (!isolated || productionShaped) {
    throw new Error(
      "REFUSING synthetic fixture: DATABASE_URL is not the isolated Field Test database"
    );
  }
}

export function createHarnessClient(databaseUrl: string) {
  assertIsolatedFieldTestDatabase(databaseUrl);
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}

async function completePrivacyIfNeeded(
  db: PrismaClient,
  userId: string,
  dealerId: string
) {
  const existing = await db.privacyAiOnboardingState.findUnique({
    where: { userId_dealerId: { userId, dealerId } },
    select: { completedAt: true },
  });
  if (existing?.completedAt) return;
  const {
    CONSENT_TEXT_VERSION,
    PRIVACY_CONSENT_TYPES,
    PRIVACY_POLICY_VERSION,
    TERMS_VERSION,
  } = await import("@/config/legal/versions");
  for (const type of PRIVACY_CONSENT_TYPES) {
    await db.privacyConsentDecision.create({
      data: {
        userId,
        dealerId,
        consentType: type,
        value: false,
        consentTextVersion: CONSENT_TEXT_VERSION,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        source: "synthetic_e2e_harness",
      },
    });
  }
  await db.legalAcceptance.create({
    data: {
      userId,
      dealerId,
      termsVersion: TERMS_VERSION,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      consentTextVersion: CONSENT_TEXT_VERSION,
      source: "synthetic_e2e_harness",
    },
  });
  await db.privacyAiOnboardingState.upsert({
    where: { userId_dealerId: { userId, dealerId } },
    create: { userId, dealerId, completedAt: new Date() },
    update: { completedAt: new Date() },
  });
}

async function issueAccessToken(db: PrismaClient, userId: string) {
  const accessToken = randomBytes(32).toString("base64url");
  const refreshToken = randomBytes(32).toString("base64url");
  const now = Date.now();
  await db.mobileSession.create({
    data: {
      userId,
      familyId: randomBytes(16).toString("base64url"),
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      accessExpiresAt: new Date(now + 12 * 60 * 60 * 1000),
      refreshExpiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      platform: "e2e",
    },
  });
  return accessToken;
}

export async function wipeSyntheticE2E(db: PrismaClient) {
  const dealers = await db.dealer.findMany({
    where: {
      OR: [
        { email: { startsWith: SYNTHETIC_E2E_EMAIL_PREFIX } },
        { cohort: SYNTHETIC_E2E_COHORT },
      ],
    },
    select: { id: true, marketMode: true, email: true },
  });
  if (dealers.some((d) => d.marketMode === "REAL")) {
    throw new Error("REFUSING wipe: a tagged dealer is REAL");
  }
  const dealerIds = dealers.map((d) => d.id);
  if (dealerIds.length) {
    await db.reveal.deleteMany({
      where: {
        OR: [
          { buyerDealerId: { in: dealerIds } },
          { sellerDealerId: { in: dealerIds } },
        ],
      },
    });
    await db.dealer.deleteMany({ where: { id: { in: dealerIds } } });
  }
  await db.user.deleteMany({
    where: { email: { startsWith: SYNTHETIC_E2E_EMAIL_PREFIX } },
  });
}

export async function ensureSyntheticDealers(
  db: PrismaClient
): Promise<{ a: SyntheticIdentity; b: SyntheticIdentity }> {
  await wipeSyntheticE2E(db);
  const passwordHash = await hash(SYNTHETIC_E2E_PASSWORD, 10);
  const specs = [
    {
      tag: "A" as const,
      email: `${SYNTHETIC_E2E_EMAIL_PREFIX}a@rematcher.test`,
      name: "E2E Synthetic A",
      businessName: "E2E Synthetic Motors A",
      phone: "0501111001",
    },
    {
      tag: "B" as const,
      email: `${SYNTHETIC_E2E_EMAIL_PREFIX}b@rematcher.test`,
      name: "E2E Synthetic B",
      businessName: "E2E Synthetic Motors B",
      phone: "0501111002",
    },
  ];
  const out: SyntheticIdentity[] = [];
  for (const spec of specs) {
    const user = await db.user.create({
      data: {
        email: spec.email,
        name: spec.name,
        passwordHash,
        emailVerifiedAt: new Date(),
        role: "DEALER_USER",
      },
    });
    const dealer = await db.dealer.create({
      data: {
        businessName: spec.businessName,
        contactName: spec.name,
        phone: spec.phone,
        email: spec.email,
        verificationStatus: "VERIFIED",
        isActive: true,
        cohort: SYNTHETIC_E2E_COHORT,
        marketMode: "SYNTHETIC",
        canAccessSyntheticMarket: true,
        city: "תל אביב",
        region: "מרכז",
      },
    });
    await db.dealerMembership.create({
      data: { userId: user.id, dealerId: dealer.id, role: "OWNER" },
    });
    await db.dealerCommercial.upsert({
      where: { dealerId: dealer.id },
      create: {
        dealerId: dealer.id,
        freeRevealAllowance: 9999,
        freeRevealUsed: 0,
        monthlyRevealAllowance: 0,
        monthlyRevealUsed: 0,
      },
      update: { freeRevealAllowance: 9999, freeRevealUsed: 0 },
    });
    await completePrivacyIfNeeded(db, user.id, dealer.id);
    const accessToken = await issueAccessToken(db, user.id);
    out.push({
      tag: spec.tag,
      userId: user.id,
      dealerId: dealer.id,
      email: spec.email,
      accessToken,
    });
  }
  return { a: out[0]!, b: out[1]! };
}

export async function markVehicleNetworkReady(
  db: PrismaClient,
  vehicleId: string,
  extra?: { b2bPrice?: number }
) {
  return db.vehicle.update({
    where: { id: vehicleId },
    data: {
      mediaReady: true,
      freshnessState: "FRESH",
      lastAvailabilityConfirmedAt: new Date(),
      lastInventoryUpdate: new Date(),
      ...(extra?.b2bPrice != null ? { b2bPrice: extra.b2bPrice } : {}),
    },
  });
}

export async function createPendingDemand(
  db: PrismaClient,
  dealerId: string,
  rawText: string,
  parsed: Record<string, unknown>
) {
  return db.demand.create({
    data: {
      dealerId,
      status: "PENDING_CONFIRMATION",
      rawText,
      parsedJson: parsed as never,
    },
  });
}

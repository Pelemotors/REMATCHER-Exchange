/**
 * Seed Apple App Review demo dealer on Production (or any DATABASE_URL).
 *
 * Usage:
 *   set -a && source .env.production && set +a
 *   APPLE_REVIEW_PASSWORD='…' npx tsx scripts/seed-apple-review-dealer.ts
 *
 * Password is never logged or committed. Re-running resets mock inventory/demands
 * for this dealer only (tagged rawInput / rawText).
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import {
  CONSENT_TEXT_VERSION,
  PRIVACY_CONSENT_TYPES,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} from "../src/config/legal/versions";

const prisma = new PrismaClient();

const EMAIL = "apple-review@rematcher.co.il";
const NAME = "Apple Review";
const BUSINESS = "REMATCHER Demo Motors";
const PHONE = "0500000099";
const MOCK_TAG = "[Apple Review Mock]";

const PASSWORD = process.env.APPLE_REVIEW_PASSWORD;
if (!PASSWORD) {
  console.error("Set APPLE_REVIEW_PASSWORD in the environment (not in git)");
  process.exit(1);
}

async function completePrivacy(userId: string, dealerId: string) {
  const existing = await prisma.privacyAiOnboardingState.findUnique({
    where: { userId_dealerId: { userId, dealerId } },
  });
  if (existing?.completedAt) return;

  for (const type of PRIVACY_CONSENT_TYPES) {
    await prisma.privacyConsentDecision.create({
      data: {
        userId,
        dealerId,
        consentType: type,
        value: false,
        consentTextVersion: CONSENT_TEXT_VERSION,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        source: "apple_review_seed",
      },
    });
  }
  await prisma.legalAcceptance.create({
    data: {
      userId,
      dealerId,
      termsVersion: TERMS_VERSION,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      consentTextVersion: CONSENT_TEXT_VERSION,
      source: "apple_review_seed",
    },
  });
  await prisma.privacyAiOnboardingState.upsert({
    where: { userId_dealerId: { userId, dealerId } },
    create: { userId, dealerId, completedAt: new Date() },
    update: { completedAt: new Date() },
  });
}

async function upsertDealer() {
  const passwordHash = await hash(PASSWORD!, 12);
  let user = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: { memberships: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        name: NAME,
        phone: PHONE,
        passwordHash,
        emailVerifiedAt: new Date(),
        role: "DEALER_USER",
        accountStatus: "ACTIVE",
      },
      include: { memberships: true },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: NAME,
        phone: PHONE,
        passwordHash,
        emailVerifiedAt: new Date(),
        role: "DEALER_USER",
        accountStatus: "ACTIVE",
      },
    });
    user = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { memberships: true },
    });
  }

  let dealer =
    user.memberships[0] != null
      ? await prisma.dealer.findUnique({ where: { id: user.memberships[0]!.dealerId } })
      : await prisma.dealer.findFirst({ where: { email: EMAIL } });

  if (!dealer) {
    dealer = await prisma.dealer.create({
      data: {
        businessName: BUSINESS,
        contactName: NAME,
        phone: PHONE,
        email: EMAIL,
        city: "תל אביב",
        region: "מרכז",
        verificationStatus: "VERIFIED",
        isActive: true,
        cohort: "APPLE_REVIEW",
      },
    });
  } else {
    dealer = await prisma.dealer.update({
      where: { id: dealer.id },
      data: {
        businessName: BUSINESS,
        contactName: NAME,
        phone: PHONE,
        email: EMAIL,
        city: "תל אביב",
        region: "מרכז",
        verificationStatus: "VERIFIED",
        isActive: true,
        cohort: "APPLE_REVIEW",
      },
    });
  }

  await prisma.dealerMembership.upsert({
    where: { userId_dealerId: { userId: user.id, dealerId: dealer.id } },
    create: { userId: user.id, dealerId: dealer.id, role: "OWNER" },
    update: { role: "OWNER" },
  });

  await prisma.dealerCommercial.upsert({
    where: { dealerId: dealer.id },
    create: { dealerId: dealer.id },
    update: {},
  });

  await prisma.dealerEntitlement.upsert({
    where: { dealerId: dealer.id },
    create: {
      dealerId: dealer.id,
      status: "FREE",
      trialEligible: true,
    },
    update: { status: "FREE", trialEligible: true },
  });

  await completePrivacy(user.id, dealer.id);
  return { userId: user.id, dealerId: dealer.id };
}

async function clearPreviousMocks(dealerId: string) {
  const mockVehicles = await prisma.vehicle.findMany({
    where: { dealerId, rawInput: { contains: MOCK_TAG } },
    select: { id: true },
  });
  const vehicleIds = mockVehicles.map((v) => v.id);
  if (vehicleIds.length) {
    await prisma.candidateMatch.deleteMany({
      where: { vehicleId: { in: vehicleIds } },
    });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  }

  const mockDemands = await prisma.demand.findMany({
    where: { dealerId, rawText: { contains: MOCK_TAG } },
    select: { id: true },
  });
  const demandIds = mockDemands.map((d) => d.id);
  if (demandIds.length) {
    await prisma.candidateMatch.deleteMany({
      where: { demandId: { in: demandIds } },
    });
    await prisma.demandConstraint.deleteMany({
      where: { demandId: { in: demandIds } },
    });
    await prisma.searchIntentVersion.deleteMany({
      where: { demandId: { in: demandIds } },
    });
    await prisma.demand.updateMany({
      where: { id: { in: demandIds } },
      data: { activeSearchIntentVersionId: null },
    });
    await prisma.demand.deleteMany({ where: { id: { in: demandIds } } });
  }

  await prisma.customer.deleteMany({
    where: { dealerId, name: { startsWith: "לקוח דמו" } },
  });

  await prisma.marketWatch.deleteMany({
    where: { dealerId, queryMake: "Mazda", queryModel: "CX-5" },
  });
}

type VehicleSeed = {
  make: string;
  model: string;
  year: number;
  mileage: number;
  ownershipHand: number;
  ownershipType: string;
  color: string;
  b2bPrice: number;
  retailPrice: number;
  fuel: string;
  engine: string;
  visibility: "PRIVATE" | "ANONYMOUS_NETWORK";
};

const VEHICLES: VehicleSeed[] = [
  {
    make: "Mazda",
    model: "CX-5",
    year: 2023,
    mileage: 42000,
    ownershipHand: 1,
    ownershipType: "PRIVATE",
    color: "לבן",
    b2bPrice: 145000,
    retailPrice: 158000,
    fuel: "GASOLINE",
    engine: "2000",
    visibility: "ANONYMOUS_NETWORK",
  },
  {
    make: "Mazda",
    model: "CX-5",
    year: 2022,
    mileage: 58000,
    ownershipHand: 2,
    ownershipType: "PRIVATE",
    color: "אפור",
    b2bPrice: 132000,
    retailPrice: 145000,
    fuel: "GASOLINE",
    engine: "2000",
    visibility: "PRIVATE",
  },
  {
    make: "Seat",
    model: "Ateca",
    year: 2021,
    mileage: 71000,
    ownershipHand: 1,
    ownershipType: "PRIVATE",
    color: "כחול",
    b2bPrice: 115000,
    retailPrice: 128000,
    fuel: "GASOLINE",
    engine: "1500",
    visibility: "ANONYMOUS_NETWORK",
  },
  {
    make: "Honda",
    model: "Jazz",
    year: 2021,
    mileage: 38000,
    ownershipHand: 1,
    ownershipType: "PRIVATE",
    color: "אדום",
    b2bPrice: 78000,
    retailPrice: 89000,
    fuel: "HYBRID",
    engine: "1500",
    visibility: "PRIVATE",
  },
  {
    make: "Toyota",
    model: "RAV4",
    year: 2022,
    mileage: 49000,
    ownershipHand: 1,
    ownershipType: "LEASING",
    color: "כסף",
    b2bPrice: 168000,
    retailPrice: 185000,
    fuel: "HYBRID",
    engine: "2500",
    visibility: "PRIVATE",
  },
  {
    make: "Hyundai",
    model: "Tucson",
    year: 2020,
    mileage: 92000,
    ownershipHand: 2,
    ownershipType: "PRIVATE",
    color: "שחור",
    b2bPrice: 98000,
    retailPrice: 109000,
    fuel: "GASOLINE",
    engine: "1600",
    visibility: "ANONYMOUS_NETWORK",
  },
];

async function seedVehicles(dealerId: string) {
  const ids: string[] = [];
  for (const v of VEHICLES) {
    const raw = `${MOCK_TAG} ${v.make} ${v.model} ${v.year}`;
    const row = await prisma.vehicle.create({
      data: {
        dealerId,
        status: "ACTIVE",
        dealerRelationship: "OWNED",
        visibility: v.visibility,
        rawInput: raw,
        make: v.make,
        model: v.model,
        year: v.year,
        mileage: v.mileage,
        ownershipHand: v.ownershipHand,
        ownershipType: v.ownershipType,
        color: v.color,
        b2bPrice: v.b2bPrice,
        retailPrice: v.retailPrice,
        region: "מרכז",
        mediaReady: true,
        freshnessState: "FRESH",
        lastAvailabilityConfirmedAt: new Date(),
        lastInventoryUpdate: new Date(),
        fieldProvenance: {
          fuel: { value: v.fuel, source: "apple_review_seed" },
          engine: { value: v.engine, source: "apple_review_seed" },
          ownershipType: { value: v.ownershipType, source: "apple_review_seed" },
        },
      },
    });
    ids.push(row.id);
  }
  return ids;
}

async function seedCustomersAndDemands(dealerId: string) {
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        dealerId,
        name: "לקוח דמו יוסי",
        rawPhone: "050-111-2233",
        normalizedPhone: "0501112233",
        status: "ACTIVE",
        sourceJson: { source: "apple_review_seed" },
      },
    }),
    prisma.customer.create({
      data: {
        dealerId,
        name: "לקוח דמו מיכל",
        rawPhone: "052-987-6543",
        normalizedPhone: "0529876543",
        status: "ACTIVE",
        sourceJson: { source: "apple_review_seed" },
      },
    }),
  ]);

  const demandSpecs = [
    {
      customerId: customers[0]!.id,
      rawText: `${MOCK_TAG} מחפש Mazda CX-5 2022 ומעלה עד 150 אלף`,
      confirmed: {
        make: "Mazda",
        model: "CX-5",
        yearMin: 2022,
        yearMax: 2024,
        budgetMax: 150000,
        fuel: "GASOLINE",
      },
    },
    {
      customerId: customers[1]!.id,
      rawText: `${MOCK_TAG} מחפש Seat Ateca 2020–2022 עד 125 אלף`,
      confirmed: {
        make: "Seat",
        model: "Ateca",
        yearMin: 2020,
        yearMax: 2022,
        budgetMax: 125000,
      },
    },
    {
      customerId: null as string | null,
      rawText: `${MOCK_TAG} מחפש Honda Jazz היברידי 2020 ומעלה עד 90 אלף`,
      confirmed: {
        make: "Honda",
        model: "Jazz",
        yearMin: 2020,
        yearMax: 2023,
        budgetMax: 90000,
        fuel: "HYBRID",
      },
    },
  ];

  const demandIds: string[] = [];
  for (const spec of demandSpecs) {
    const demand = await prisma.demand.create({
      data: {
        dealerId,
        customerId: spec.customerId,
        status: "ACTIVE",
        networkVisibility: "ANONYMOUS_NETWORK",
        rawText: spec.rawText,
        parsedJson: spec.confirmed,
        confirmedJson: spec.confirmed,
        parsedAt: new Date(),
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    demandIds.push(demand.id);

    // Light search-intent so matching can resolve without AI.
    const intent = await prisma.searchIntentVersion.create({
      data: {
        demandId: demand.id,
        version: 1,
        status: "ACTIVE",
        source: "apple_review_seed",
        naturalLanguageSummary: spec.rawText.replace(MOCK_TAG, "").trim(),
        structuredIntent: {
          vehicleUniverse: {
            make: spec.confirmed.make,
            model: spec.confirmed.model,
          },
          year: {
            min: spec.confirmed.yearMin,
            max: spec.confirmed.yearMax,
          },
          budgets: { max: spec.confirmed.budgetMax },
          ...(spec.confirmed.fuel
            ? { fuel: { preferred: [spec.confirmed.fuel] } }
            : {}),
        },
        confirmedAt: new Date(),
      },
    });
    await prisma.demand.update({
      where: { id: demand.id },
      data: { activeSearchIntentVersionId: intent.id },
    });
  }

  return { customerCount: customers.length, demandIds };
}

async function seedWatch(dealerId: string, userId: string) {
  return prisma.marketWatch.create({
    data: {
      dealerId,
      userId,
      queryMake: "Mazda",
      queryModel: "CX-5",
      yearMin: 2021,
      yearMax: 2024,
      active: true,
    },
  });
}

async function main() {
  const { userId, dealerId } = await upsertDealer();
  await clearPreviousMocks(dealerId);
  const vehicleIds = await seedVehicles(dealerId);
  const { customerCount, demandIds } = await seedCustomersAndDemands(dealerId);
  await seedWatch(dealerId, userId);

  // Best-effort rematch so Matches screen is not empty.
  // Prefer: npx tsx scripts/rematch-apple-review.ts (stubs server-only).
  console.log(
    "Hint: run `npx tsx scripts/rematch-apple-review.ts` if Matches is empty."
  );

  const inventory = await prisma.vehicle.count({
    where: { dealerId, status: "ACTIVE" },
  });
  const demands = await prisma.demand.count({
    where: { dealerId, status: "ACTIVE" },
  });
  const matches = await prisma.candidateMatch.count({
    where: {
      OR: [
        { vehicleId: { in: vehicleIds } },
        { demandId: { in: demandIds } },
      ],
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        email: EMAIL,
        dealerId,
        userId,
        inventory,
        demands,
        customers: customerCount,
        candidateMatches: matches,
        note: "Password set from APPLE_REVIEW_PASSWORD (not printed)",
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

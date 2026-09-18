/**
 * Seeds isolated SYNTHETIC dealers + overlapping CX-5/Tucson inventory/demands
 * for beta market intelligence/matching (privacy-threshold friendly).
 *
 * Usage: npx tsx scripts/seed-synthetic-beta-market.ts
 * Optional: SYNTHETIC_BETA_REAL_DEALER_ID=<id> enables canAccessSyntheticMarket on that REAL dealer.
 */
import { PrismaClient } from "@prisma/client";
import { toPrismaJson } from "../src/lib/prisma-json";

const prisma = new PrismaClient();

const SYNTHETIC_PROFILES = [
  { slug: "synth-north", city: "חיפה", region: "צפון" },
  { slug: "synth-center", city: "תל אביב", region: "מרכז" },
  { slug: "synth-south", city: "באר שבע", region: "דרום" },
  { slug: "synth-jerusalem", city: "ירושלים", region: "ירושלים" },
  { slug: "synth-sharon", city: "נתניה", region: "מרכז" },
  { slug: "synth-valley", city: "עפולה", region: "צפון" },
] as const;

const MODELS = [
  { make: "Mazda", model: "CX-5", year: 2022 },
  { make: "Hyundai", model: "Tucson", year: 2021 },
  { make: "Kia", model: "Sportage", year: 2020 },
  { make: "Nissan", model: "Qashqai", year: 2018 },
  { make: "Seat", model: "Ateca", year: 2021 },
  { make: "Toyota", model: "RAV4", year: 2022 },
  { make: "Honda", model: "Jazz", year: 2021 },
  { make: "Renault", model: "Clio", year: 2022 },
] as const;

async function upsertSyntheticDealer(slug: string, city: string, region: string) {
  const email = `${slug}@synthetic-beta.rematcher-exchange.test`;
  const existing = await prisma.dealer.findFirst({
    where: { email },
  });
  if (existing) {
    return prisma.dealer.update({
      where: { id: existing.id },
      data: {
        marketMode: "SYNTHETIC",
        verificationStatus: "VERIFIED",
        isActive: true,
      },
    });
  }

  return prisma.dealer.create({
    data: {
      businessName: `Synthetic Beta ${slug}`,
      contactName: "Beta Seed",
      phone: `050${String(Math.floor(1000000 + Math.random() * 8999999))}`,
      email,
      city,
      region,
      verificationStatus: "VERIFIED",
      isActive: true,
      marketMode: "SYNTHETIC",
      canAccessSyntheticMarket: false,
      cohort: "SYNTHETIC_BETA",
    },
  });
}

async function seedInventory(dealerId: string, idx: number) {
  for (let i = 0; i < MODELS.length; i++) {
    const m = MODELS[i]!;
    const plate = `9${String(idx).padStart(2, "0")}${String(i).padStart(4, "0")}`;
    const tag = `synthetic:${plate}`;
    const existing = await prisma.vehicle.findFirst({
      where: { dealerId, rawInput: { contains: tag } },
    });
    if (existing) continue;
    await prisma.vehicle.create({
      data: {
        dealerId,
        status: "ACTIVE",
        visibility: "ANONYMOUS_NETWORK",
        mediaReady: true,
        dealerRelationship: "OWNED",
        make: m.make,
        model: m.model,
        year: m.year + (idx % 3) - 1,
        mileage: 35000 + idx * 1200 + i * 800,
        ownershipHand: (i % 3) + 1,
        ownershipType: i % 2 === 0 ? "PRIVATE" : "LEASING",
        b2bPrice: 95000 + idx * 2500 + i * 1500,
        retailPrice: 110000 + idx * 2500 + i * 1800,
        rawInput: tag,
        fieldProvenance: toPrismaJson({
          licensePlate: { value: plate, source: "SYNTHETIC_SEED" },
          fuel: {
            value: i % 3 === 0 ? "HYBRID" : "GASOLINE",
            source: "SYNTHETIC_SEED",
          },
          engine: { value: String(1600 + (i % 4) * 200), source: "SYNTHETIC_SEED" },
        }),
      },
    });
  }
}

async function seedDemand(dealerId: string, target: (typeof MODELS)[number], idx: number) {
  const rawText = `[Synthetic Beta] מחפש ${target.make} ${target.model} ${target.year - 1}+ עד ${130000 + idx * 5000}`;
  const existing = await prisma.demand.findFirst({
    where: { dealerId, rawText, status: "ACTIVE" },
  });
  if (existing) return;
  await prisma.demand.create({
    data: {
      dealerId,
      status: "ACTIVE",
      networkVisibility: "ANONYMOUS_NETWORK",
      rawText,
      confirmedJson: toPrismaJson({
        make: target.make,
        model: target.model,
        yearMin: target.year - 1,
        yearMax: target.year + 1,
        budgetMax: 130000 + idx * 5000,
      }),
      confirmedAt: new Date(),
      expiresAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    },
  });
}

async function main() {
  const dealers = [];
  for (const p of SYNTHETIC_PROFILES) {
    const d = await upsertSyntheticDealer(p.slug, p.city, p.region);
    dealers.push(d);
    await seedInventory(d.id, dealers.length);
    // Each dealer publishes several overlapping anonymous demands
    for (let j = 0; j < MODELS.length; j++) {
      if ((j + dealers.length) % 2 === 0) {
        await seedDemand(d.id, MODELS[j]!, dealers.length + j);
      }
    }
  }

  const betaRealId = process.env.SYNTHETIC_BETA_REAL_DEALER_ID?.trim();
  if (betaRealId) {
    await prisma.dealer.updateMany({
      where: { id: betaRealId, marketMode: "REAL" },
      data: { canAccessSyntheticMarket: true },
    });
    console.log(`Enabled synthetic beta access for REAL dealer ${betaRealId}`);
  }

  // Also enable apple-review demo by email if present
  await prisma.dealer.updateMany({
    where: { email: "apple-review@rematcher.co.il", marketMode: "REAL" },
    data: { canAccessSyntheticMarket: true, cohort: "APPLE_REVIEW" },
  });

  const synthSupply = await prisma.vehicle.count({
    where: { dealer: { marketMode: "SYNTHETIC" }, status: "ACTIVE" },
  });
  const synthDemand = await prisma.demand.count({
    where: { dealer: { marketMode: "SYNTHETIC" }, status: "ACTIVE" },
  });
  console.log(
    JSON.stringify({
      dealers: dealers.length,
      synthSupply,
      synthDemand,
      dealerIds: dealers.map((d) => d.id),
    })
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

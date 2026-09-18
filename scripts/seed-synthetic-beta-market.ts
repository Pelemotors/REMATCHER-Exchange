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
  { make: "Mazda", model: "CX-5", year: 2020 },
  { make: "Hyundai", model: "Tucson", year: 2021 },
  { make: "Kia", model: "Sportage", year: 2019 },
] as const;

async function upsertSyntheticDealer(slug: string, city: string, region: string) {
  const email = `${slug}@synthetic-beta.rematcher-exchange.test`;
  const existing = await prisma.dealer.findFirst({
    where: { email },
  });
  if (existing) return existing;

  return prisma.dealer.create({
    data: {
      businessName: `Synthetic Beta ${slug}`,
      contactName: "Beta Seed",
      phone: `050-${Math.floor(Math.random() * 9000000 + 1000000)}`,
      email,
      city,
      region,
      verificationStatus: "VERIFIED",
      marketMode: "SYNTHETIC",
      canAccessSyntheticMarket: false,
    },
  });
}

async function seedInventory(dealerId: string, idx: number) {
  for (let i = 0; i < MODELS.length; i++) {
    const m = MODELS[i]!;
    const plate = `9${String(idx).padStart(2, "0")}${String(i).padStart(4, "0")}`;
    const existing = await prisma.vehicle.findFirst({
      where: { dealerId, rawInput: { contains: `synthetic:${plate}` } },
    });
    if (existing) continue;
    await prisma.vehicle.create({
      data: {
        dealerId,
        status: "ACTIVE",
        visibility: "ANONYMOUS_NETWORK",
        mediaReady: true,
        dealerRelationship: "INVENTORY",
        make: m.make,
        model: m.model,
        year: m.year,
        mileage: 45000 + idx * 1000 + i * 500,
        b2bPrice: 115000 + idx * 2000,
        rawInput: `synthetic:${plate}`,
        fieldProvenance: toPrismaJson({
          licensePlate: { value: plate, source: "SYNTHETIC_SEED" },
        }),
      },
    });
  }
}

async function seedDemand(dealerId: string, target: (typeof MODELS)[number]) {
  const title = `${target.make} ${target.model}`;
  const existing = await prisma.demand.findFirst({
    where: { dealerId, title, status: "ACTIVE" },
  });
  if (existing) return;
  await prisma.demand.create({
    data: {
      dealerId,
      title,
      status: "ACTIVE",
      networkVisibility: "ANONYMOUS_NETWORK",
      confirmedJson: toPrismaJson({
        make: target.make,
        model: target.model,
        yearMin: target.year - 1,
        yearMax: target.year + 1,
      }),
    },
  });
}

async function main() {
  const dealers = [];
  for (const p of SYNTHETIC_PROFILES) {
    const d = await upsertSyntheticDealer(p.slug, p.city, p.region);
    dealers.push(d);
    await seedInventory(d.id, dealers.length);
    await seedDemand(d, MODELS[dealers.length % MODELS.length]!);
  }

  const betaRealId = process.env.SYNTHETIC_BETA_REAL_DEALER_ID?.trim();
  if (betaRealId) {
    await prisma.dealer.updateMany({
      where: { id: betaRealId, marketMode: "REAL" },
      data: { canAccessSyntheticMarket: true },
    });
    console.log(`Enabled synthetic beta access for REAL dealer ${betaRealId}`);
  }

  console.log(
    `Synthetic beta market: ${dealers.length} dealers (${dealers.map((d) => d.id).join(", ")})`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

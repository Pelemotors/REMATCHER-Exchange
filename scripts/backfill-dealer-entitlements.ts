/**
 * Backfill DealerEntitlement rows for dealers missing one.
 * Usage: npx tsx scripts/backfill-dealer-entitlements.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const dealers = await prisma.dealer.findMany({
    where: { entitlement: null },
    select: { id: true },
  });

  let created = 0;
  for (const d of dealers) {
    await prisma.dealerEntitlement.create({
      data: { dealerId: d.id, status: "FREE", trialEligible: true },
    });
    created += 1;
  }

  console.log(`Backfilled ${created} DealerEntitlement row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Rematch Apple Review mock inventory/demands (stubs server-only for CLI).
 * Usage: set -a && source .env.production && set +a && npx tsx scripts/rematch-apple-review.ts
 */
import Module from "module";

const orig = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === "server-only") return {};
  return orig.apply(this, arguments as unknown as [string]);
};

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const dealer = await prisma.dealer.findFirst({
    where: { email: "apple-review@rematcher.co.il" },
  });
  if (!dealer) throw new Error("apple-review dealer missing");

  const vehicles = await prisma.vehicle.findMany({
    where: {
      dealerId: dealer.id,
      status: "ACTIVE",
      rawInput: { contains: "[Apple Review Mock]" },
    },
    select: { id: true },
  });
  const demands = await prisma.demand.findMany({
    where: {
      dealerId: dealer.id,
      status: "ACTIVE",
      rawText: { contains: "[Apple Review Mock]" },
    },
    select: { id: true },
  });

  const { rematchInventoryBatch } = await import(
    "../src/services/matching/inventory-rematch"
  );
  const rematch = await rematchInventoryBatch({
    vehicleIds: vehicles.map((v) => v.id),
    sellerDealerId: dealer.id,
  });
  console.log("rematchInventoryBatch", rematch);

  const { runMatchingForDemand } = await import(
    "../src/services/domain/matching-flow"
  );
  for (const d of demands) {
    try {
      await runMatchingForDemand(d.id);
      console.log("matched demand", d.id);
    } catch (e) {
      console.warn(
        "demand rematch fail",
        d.id,
        e instanceof Error ? e.message : e
      );
    }
  }

  const matches = await prisma.candidateMatch.count({
    where: {
      OR: [
        { vehicleId: { in: vehicles.map((v) => v.id) } },
        { demandId: { in: demands.map((d) => d.id) } },
      ],
    },
  });
  console.log(
    JSON.stringify({
      dealerId: dealer.id,
      vehicles: vehicles.length,
      demands: demands.length,
      matches,
    })
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

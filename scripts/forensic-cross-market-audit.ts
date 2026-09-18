/**
 * Read-only cross-market contamination audit (REAL × SYNTHETIC leakage).
 * Default: print counts + sample IDs. Optional --cleanup deletes only
 * clearly synthetic-contaminated CandidateMatch / Opportunity rows (never REAL-REAL).
 *
 * Usage: npx tsx scripts/forensic-cross-market-audit.ts [--cleanup]
 */
import { prisma } from "@/lib/prisma";
import { marketsCompatible, marketSideFromDealerRow } from "@/services/dealer/market-scope";

type SideRow = {
  marketMode: "REAL" | "SYNTHETIC";
  canAccessSyntheticMarket: boolean;
};

function contaminatedPair(a: SideRow, b: SideRow): boolean {
  const sa = marketSideFromDealerRow(a);
  const sb = marketSideFromDealerRow(b);
  return !marketsCompatible(sa, sb);
}

async function auditCandidateMatches() {
  const rows = await prisma.candidateMatch.findMany({
    select: {
      id: true,
      demand: {
        select: {
          dealer: {
            select: { marketMode: true, canAccessSyntheticMarket: true },
          },
        },
      },
      vehicle: {
        select: {
          dealer: {
            select: { marketMode: true, canAccessSyntheticMarket: true },
          },
        },
      },
    },
    take: 5000,
  });
  const bad = rows.filter((r) =>
    contaminatedPair(
      r.demand.dealer,
      r.vehicle.dealer
    )
  );
  return { total: rows.length, bad };
}

async function auditDealerOpportunities() {
  const rows = await prisma.dealerOpportunity.findMany({
    where: { vehicleId: { not: null }, demandId: { not: null } },
    select: {
      id: true,
      vehicle: {
        select: {
          dealer: {
            select: { marketMode: true, canAccessSyntheticMarket: true },
          },
        },
      },
      demand: {
        select: {
          dealer: {
            select: { marketMode: true, canAccessSyntheticMarket: true },
          },
        },
      },
    },
    take: 5000,
  });
  const bad = rows.filter(
    (r) =>
      r.vehicle?.dealer &&
      r.demand?.dealer &&
      contaminatedPair(r.demand.dealer, r.vehicle.dealer)
  );
  return { total: rows.length, bad };
}

async function auditSellerOpportunities() {
  const rows = await prisma.sellerOpportunity.findMany({
    select: {
      id: true,
      candidateMatch: {
        select: {
          demand: {
            select: {
              dealer: {
                select: { marketMode: true, canAccessSyntheticMarket: true },
              },
            },
          },
          vehicle: {
            select: {
              dealer: {
                select: { marketMode: true, canAccessSyntheticMarket: true },
              },
            },
          },
        },
      },
    },
    take: 5000,
  });
  const bad = rows.filter((r) => {
    const cm = r.candidateMatch;
    if (!cm) return false;
    return contaminatedPair(cm.demand.dealer, cm.vehicle.dealer);
  });
  return { total: rows.length, bad };
}

async function main() {
  const cleanup = process.argv.includes("--cleanup");

  const [matches, dealerOpps, sellerOpps] = await Promise.all([
    auditCandidateMatches(),
    auditDealerOpportunities(),
    auditSellerOpportunities(),
  ]);

  console.log("=== Cross-market audit (incompatible REAL×SYNTHETIC pairs) ===");
  console.log("CandidateMatch scanned:", matches.total, "contaminated:", matches.bad.length);
  console.log(" sample:", matches.bad.slice(0, 8).map((r) => r.id));
  console.log("DealerOpportunity scanned:", dealerOpps.total, "contaminated:", dealerOpps.bad.length);
  console.log(" sample:", dealerOpps.bad.slice(0, 8).map((r) => r.id));
  console.log("SellerOpportunity scanned:", sellerOpps.total, "contaminated:", sellerOpps.bad.length);
  console.log(" sample:", sellerOpps.bad.slice(0, 8).map((r) => r.id));

  if (!cleanup) {
    console.log("\nAudit-only mode. Pass --cleanup to delete contaminated rows listed above.");
    return;
  }

  const matchIds = matches.bad.map((r) => r.id);
  const dealerOppIds = dealerOpps.bad.map((r) => r.id);
  const sellerOppIds = sellerOpps.bad.map((r) => r.id);

  if (matchIds.length) {
    await prisma.sellerOpportunity.deleteMany({
      where: { candidateMatchId: { in: matchIds } },
    });
    await prisma.candidateMatch.deleteMany({ where: { id: { in: matchIds } } });
  }
  if (sellerOppIds.length) {
    await prisma.sellerOpportunity.deleteMany({ where: { id: { in: sellerOppIds } } });
  }
  if (dealerOppIds.length) {
    await prisma.dealerOpportunity.deleteMany({ where: { id: { in: dealerOppIds } } });
  }

  console.log("\nCleanup deleted:", {
    candidateMatches: matchIds.length,
    sellerOpportunities: sellerOppIds.length,
    dealerOpportunities: dealerOppIds.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

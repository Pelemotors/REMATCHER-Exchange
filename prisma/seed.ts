import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seed is not allowed in production. Use bootstrap-admin instead.");
  }
  if (process.env.SEED_DEMO !== "true") {
    throw new Error("Set SEED_DEMO=true to run development seed.");
  }

  console.log("🌱 Seeding database...");

  await prisma.appEvent.deleteMany();
  await prisma.revealUsage.deleteMany();
  await prisma.dealerCommercial.deleteMany();
  await prisma.outcome.deleteMany();
  await prisma.reveal.deleteMany();
  await prisma.mutualInterest.deleteMany();
  await prisma.sellerInterest.deleteMany();
  await prisma.sellerOpportunity.deleteMany();
  await prisma.buyerInterest.deleteMany();
  await prisma.validationEvent.deleteMany();
  await prisma.candidateMatch.deleteMany();
  await prisma.demandConstraint.deleteMany();
  await prisma.demand.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.dealerMembership.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.dealer.deleteMany();

  const passwordHash = await bcrypt.hash("demo123", 10);

  // Admin
  const admin = await prisma.user.create({
    data: {
      email: "admin@demo.com",
      passwordHash,
      name: "Admin",
      role: "ADMIN",
    },
  });

  // Dealer A — Seller (has CX-5)
  const sellerDealer = await prisma.dealer.create({
    data: {
      businessName: "Auto North תל אביב",
      contactName: "יוסי כהן",
      phone: "050-1111111",
      city: "מרכז",
      region: "מרכז",
      verificationStatus: "VERIFIED",
    },
  });

  const sellerUser = await prisma.user.create({
    data: {
      email: "seller@demo.com",
      passwordHash,
      name: "יוסי כהן",
      phone: "050-1111111",
      memberships: {
        create: { dealerId: sellerDealer.id, role: "OWNER" },
      },
    },
  });

  // Dealer B — Buyer (looking for CX-5)
  const buyerDealer = await prisma.dealer.create({
    data: {
      businessName: "Premium Motors חיפה",
      contactName: "דני לevi",
      phone: "050-2222222",
      city: "חיפה",
      region: "צפון",
      verificationStatus: "VERIFIED",
    },
  });

  const buyerUser = await prisma.user.create({
    data: {
      email: "buyer@demo.com",
      passwordHash,
      name: "דני לevi",
      phone: "050-2222222",
      memberships: {
        create: { dealerId: buyerDealer.id, role: "OWNER" },
      },
    },
  });

  // Dealer C — extra inventory
  const dealerC = await prisma.dealer.create({
    data: {
      businessName: "City Cars ירושלים",
      contactName: "משה אברהם",
      phone: "050-3333333",
      city: "ירושלים",
      region: "ירושלים",
      verificationStatus: "VERIFIED",
    },
  });

  await prisma.user.create({
    data: {
      email: "dealer3@demo.com",
      passwordHash,
      name: "משה אברהם",
      memberships: { create: { dealerId: dealerC.id, role: "OWNER" } },
    },
  });

  // Seller vehicles — CX-5 scenario
  const cx5Strong = await prisma.vehicle.create({
    data: {
      dealerId: sellerDealer.id,
      make: "Mazda",
      model: "CX-5",
      trim: "Premium",
      year: 2023,
      mileage: 61000,
      color: "לבן",
      region: "מרכז",
      b2bPrice: 134000,
      retailPrice: 149000,
      ownershipHand: 1,
      freshnessState: "FRESH",
      lastAvailabilityConfirmedAt: new Date(),
      status: "ACTIVE",
    },
  });

  const cx5Alt = await prisma.vehicle.create({
    data: {
      dealerId: sellerDealer.id,
      make: "Mazda",
      model: "CX-5",
      trim: "Comfort",
      year: 2022,
      mileage: 78000,
      color: "כסף",
      region: "מרכז",
      b2bPrice: 128000,
      retailPrice: 139000,
      freshnessState: "FRESH",
      status: "ACTIVE",
    },
  });

  const cx5Red = await prisma.vehicle.create({
    data: {
      dealerId: sellerDealer.id,
      make: "Mazda",
      model: "CX-5",
      trim: "Premium",
      year: 2023,
      mileage: 45000,
      color: "אדום",
      region: "מרכז",
      b2bPrice: 125000,
      freshnessState: "FRESH",
      status: "ACTIVE",
    },
  });

  const staleVehicle = await prisma.vehicle.create({
    data: {
      dealerId: sellerDealer.id,
      make: "Mazda",
      model: "CX-5",
      trim: "Executive",
      year: 2022,
      mileage: 90000,
      color: "שחור",
      region: "מרכז",
      b2bPrice: 120000,
      freshnessState: "STALE",
      status: "ACTIVE",
    },
  });

  await prisma.vehicle.create({
    data: {
      dealerId: dealerC.id,
      make: "Skoda",
      model: "Kodiaq",
      trim: "Style",
      year: 2022,
      mileage: 55000,
      color: "לבן",
      region: "ירושלים",
      b2bPrice: 145000,
      freshnessState: "FRESH",
      status: "ACTIVE",
    },
  });

  // Pre-seed buyer demand (confirmed)
  const confirmedJson = {
    make: "Mazda",
    model: "CX-5",
    yearMin: 2022,
    budgetMax: 130000,
    trimPreference: "high_trim",
    colorExclusions: ["red"],
  };

  const demand = await prisma.demand.create({
    data: {
      dealerId: buyerDealer.id,
      rawText: "מחפש CX-5 מ-22 ומעלה, עד 130, עדיפות מפואר, לא אדום",
      parsedJson: confirmedJson,
      confirmedJson,
      status: "ACTIVE",
      parsedAt: new Date(),
      confirmedAt: new Date(),
      expiresAt: addDays(new Date(), 3),
      constraints: {
        create: [
          {
            field: "color",
            constraintType: "EXCLUSION",
            value: { description: "לא אדום", value: "red" },
            source: "user_confirmed",
          },
          {
            field: "trim",
            constraintType: "SOFT",
            value: { description: "עדיפות מפואר", value: "high_trim" },
            source: "user_confirmed",
          },
        ],
      },
    },
  });

  // Run matching manually in seed
  const { evaluateMatch, demandProfileFromConstraints, scoreBandToEnum } =
    await import("../src/services/matching/engine");
  const { explainMatch } = await import("../src/services/ai/match-explainer");

  const demandWithConstraints = await prisma.demand.findUnique({
    where: { id: demand.id },
    include: { constraints: true },
  });

  const profile = demandProfileFromConstraints(
    demandWithConstraints!.constraints,
    confirmedJson
  );
  const vehicles = [cx5Strong, cx5Alt, cx5Red, staleVehicle];

  for (const vehicle of vehicles) {
    const evaluation = evaluateMatch(vehicle, profile);
    if (evaluation.overallBand === "HIDDEN") continue;

    const explanation = await explainMatch(evaluation);
    const needsValidation = vehicle.freshnessState !== "FRESH";

    await prisma.candidateMatch.create({
      data: {
        demandId: demand.id,
        vehicleId: vehicle.id,
        status: needsValidation ? "PENDING_VALIDATION" : "VALIDATED",
        score: evaluation.score,
        scoreBand: scoreBandToEnum(evaluation.overallBand),
        hardPassed: evaluation.hardPassed,
        evaluationJson: evaluation,
        explanationJson: explanation,
        explanationText: explanation.summary,
      },
    });
  }

  // Commercial profiles — 5 free Reveals per Dealer (§49-50)
  for (const dealerId of [sellerDealer.id, buyerDealer.id, dealerC.id]) {
    await prisma.dealerCommercial.create({
      data: {
        dealerId,
        planSlug: "onboarding",
        freeRevealAllowance: 5,
        freeRevealUsed: 0,
        monthlyRevealAllowance: 0,
        monthlyRevealUsed: 0,
      },
    });
  }

  console.log("✅ Seed complete");
  console.log("");
  console.log("Demo accounts (password: demo123):");
  console.log("  buyer@demo.com  — Buyer (Premium Motors)");
  console.log("  seller@demo.com — Seller (Auto North, CX-5 inventory)");
  console.log("  admin@demo.com  — Admin");
  console.log("  dealer3@demo.com — Extra dealer");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

/**
 * One-time pilot testers — ADMIN users with dealer accounts for Core Loop QA.
 * Usage: npx tsx scripts/create-pilot-users.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PILOT_USERS = [
  {
    email: "galsamama@gmail.com",
    password: "Sam123",
    name: "גל",
    dealer: {
      businessName: "גל מוטורס",
      contactName: "גל",
      phone: "050-0000001",
      city: "תל אביב",
      region: "מרכז",
    },
  },
  {
    email: "irasamama@gmail.com",
    password: "Sam123",
    name: "אירה",
    dealer: {
      businessName: "אירה מוטורס",
      contactName: "אירה",
      phone: "050-0000002",
      city: "חיפה",
      region: "צפון",
    },
  },
] as const;

async function upsertPilotUser(entry: (typeof PILOT_USERS)[number]) {
  const passwordHash = await bcrypt.hash(entry.password, 12);
  const existing = await prisma.user.findUnique({
    where: { email: entry.email },
    include: { memberships: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { email: entry.email },
      data: {
        passwordHash,
        name: entry.name,
        role: "ADMIN",
      },
    });

    if (existing.memberships.length === 0) {
      const dealer = await prisma.dealer.create({
        data: {
          ...entry.dealer,
          email: entry.email,
          verificationStatus: "VERIFIED",
        },
      });
      await prisma.dealerMembership.create({
        data: {
          userId: existing.id,
          dealerId: dealer.id,
          role: "OWNER",
        },
      });
      await prisma.dealerCommercial.create({
        data: { dealerId: dealer.id },
      });
    } else {
      for (const membership of existing.memberships) {
        await prisma.dealer.update({
          where: { id: membership.dealerId },
          data: { verificationStatus: "VERIFIED" },
        });
      }
    }

    console.log(`Updated pilot admin: ${entry.email}`);
    return;
  }

  const dealer = await prisma.dealer.create({
    data: {
      ...entry.dealer,
      email: entry.email,
      verificationStatus: "VERIFIED",
    },
  });

  await prisma.user.create({
    data: {
      email: entry.email,
      passwordHash,
      name: entry.name,
      role: "ADMIN",
      memberships: {
        create: { dealerId: dealer.id, role: "OWNER" },
      },
    },
  });

  await prisma.dealerCommercial.create({
    data: { dealerId: dealer.id },
  });

  console.log(`Created pilot admin: ${entry.email}`);
}

async function main() {
  for (const entry of PILOT_USERS) {
    await upsertPilotUser(entry);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * QA dealer accounts — DEALER_USER only (no ADMIN).
 * Usage: npx tsx scripts/create-qa-dealers.ts
 * Credentials written to .qa-dealer-credentials.local (gitignored)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

const QA_DEALERS = [
  {
    email: "qa-buyer@rematcher-exchange.test",
    password: `QaBuyer-${Date.now().toString(36)}`,
    name: "קונה בדיקה",
    dealer: {
      businessName: "סוחר קונה QA",
      contactName: "קונה בדיקה",
      phone: "050-9000001",
      city: "רמת גן",
      region: "מרכז",
    },
  },
  {
    email: "qa-seller@rematcher-exchange.test",
    password: `QaSeller-${Date.now().toString(36)}`,
    name: "מוכר בדיקה",
    dealer: {
      businessName: "סוחר מוכר QA",
      contactName: "מוכר בדיקה",
      phone: "050-9000002",
      city: "פתח תקווה",
      region: "מרכז",
    },
  },
] as const;

async function upsertQaDealer(entry: (typeof QA_DEALERS)[number]) {
  const passwordHash = await bcrypt.hash(entry.password, 12);
  const existing = await prisma.user.findUnique({
    where: { email: entry.email },
    include: { memberships: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { email: entry.email },
      data: { passwordHash, name: entry.name, role: "DEALER_USER" },
    });
    for (const m of existing.memberships) {
      await prisma.dealer.update({
        where: { id: m.dealerId },
        data: { verificationStatus: "VERIFIED" },
      });
    }
    console.log(`Updated QA dealer: ${entry.email}`);
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
      role: "DEALER_USER",
      memberships: { create: { dealerId: dealer.id, role: "OWNER" } },
    },
  });

  await prisma.dealerCommercial.create({ data: { dealerId: dealer.id } });
  console.log(`Created QA dealer: ${entry.email}`);
}

async function main() {
  const creds: string[] = ["# QA Dealer credentials — do not commit\n"];
  for (const entry of QA_DEALERS) {
    await upsertQaDealer(entry);
    creds.push(`${entry.email} / ${entry.password}`);
  }
  const outPath = join(process.cwd(), ".qa-dealer-credentials.local");
  writeFileSync(outPath, creds.join("\n") + "\n", "utf8");
  console.log(`Credentials saved to ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

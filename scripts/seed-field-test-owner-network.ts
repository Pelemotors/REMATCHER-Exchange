/**
 * Seed Field Test Owner (Gmail) as Dealer A + counterparty Dealer B.
 * Uses real auth hash + Privacy-AI completion. Password not printed / not committed.
 *
 * Usage (Field Test DB only):
 *   set -a && source .env.field-test && set +a
 *   npx tsx scripts/seed-field-test-owner-network.ts
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

const OWNER_PASSWORD = process.env.FIELD_TEST_OWNER_PASSWORD;
if (!OWNER_PASSWORD) {
  console.error("Set FIELD_TEST_OWNER_PASSWORD in the environment (not in git)");
  process.exit(1);
}

type SeedSpec = {
  tag: "A" | "B";
  email: string;
  name: string;
  businessName: string;
  phone: string;
  role: "DEALER_USER" | "ADMIN";
  password: string;
};

async function completePrivacy(userId: string, dealerId: string) {
  for (const type of PRIVACY_CONSENT_TYPES) {
    await prisma.privacyConsentDecision.create({
      data: {
        userId,
        dealerId,
        consentType: type,
        value: false,
        consentTextVersion: CONSENT_TEXT_VERSION,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        source: "field_test_seed",
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
      source: "field_test_seed",
    },
  });
  await prisma.privacyAiOnboardingState.upsert({
    where: { userId_dealerId: { userId, dealerId } },
    create: { userId, dealerId, completedAt: new Date() },
    update: { completedAt: new Date() },
  });
}

async function upsertDealerUser(spec: SeedSpec) {
  const passwordHash = await hash(spec.password, 12);
  let user = await prisma.user.findUnique({
    where: { email: spec.email },
    include: { memberships: true },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: spec.email,
        name: spec.name,
        passwordHash,
        emailVerifiedAt: new Date(),
        role: spec.role,
      },
      include: { memberships: true },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        name: spec.name,
        emailVerifiedAt: new Date(),
        role: spec.role,
      },
    });
    user = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { memberships: true },
    });
  }

  let dealer =
    user.memberships[0] != null
      ? await prisma.dealer.findUnique({ where: { id: user.memberships[0].dealerId } })
      : await prisma.dealer.findFirst({ where: { email: spec.email } });

  if (!dealer) {
    dealer = await prisma.dealer.create({
      data: {
        businessName: spec.businessName,
        contactName: spec.name,
        phone: spec.phone,
        email: spec.email,
        verificationStatus: "VERIFIED",
        isActive: true,
        cohort: "FIELD_TEST",
        city: "תל אביב",
        region: "מרכז",
      },
    });
    await prisma.dealerCommercial.upsert({
      where: { dealerId: dealer.id },
      create: { dealerId: dealer.id },
      update: {},
    });
  } else {
    dealer = await prisma.dealer.update({
      where: { id: dealer.id },
      data: {
        businessName: spec.businessName,
        contactName: spec.name,
        phone: spec.phone,
        verificationStatus: "VERIFIED",
        isActive: true,
        cohort: "FIELD_TEST",
      },
    });
  }

  await prisma.dealerMembership.upsert({
    where: { userId_dealerId: { userId: user.id, dealerId: dealer.id } },
    create: { userId: user.id, dealerId: dealer.id, role: "OWNER" },
    update: { role: "OWNER" },
  });

  await completePrivacy(user.id, dealer.id);
  console.log(`seeded ${spec.tag}: ${spec.email} → dealer ${dealer.id}`);
  return { userId: user.id, dealerId: dealer.id, email: spec.email };
}

async function main() {
  const db = process.env.DATABASE_URL || "";
  if (!db.includes("5435") && !db.includes("field_test") && !process.env.FIELD_TEST) {
    console.error("Refusing to seed: DATABASE_URL does not look like Field Test");
    process.exit(1);
  }

  const owner = await upsertDealerUser({
    tag: "A",
    email: "galsamama@gmail.com",
    name: "גל",
    businessName: "גל מוטורס (Field Test)",
    phone: "0500000001",
    role: "DEALER_USER",
    password: OWNER_PASSWORD,
  });

  const counter = await upsertDealerUser({
    tag: "B",
    email: "fieldtest-b@rematcher.local",
    name: "Field Test B",
    businessName: "Field Test Counterparty",
    phone: "0500000002",
    role: "DEALER_USER",
    password: "FieldTest!ChangeMe1",
  });

  console.log(
    JSON.stringify({
      ok: true,
      ownerEmail: owner.email,
      ownerDealerId: owner.dealerId,
      counterEmail: counter.email,
      counterDealerId: counter.dealerId,
    })
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

/**
 * Seed Field Test dealers A/B against DATABASE_URL (use .env.field-test).
 * Does not print passwords. Credentials documented in docs/FIELD_TEST_ENVIRONMENT.md
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

async function upsertDealer(tag: "A" | "B", email: string, name: string) {
  const passwordHash = await hash("FieldTest!ChangeMe1", 10);
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        emailVerifiedAt: new Date(),
        role: "DEALER_USER",
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, emailVerifiedAt: new Date() },
    });
  }

  let dealer = await prisma.dealer.findFirst({ where: { email } });
  if (!dealer) {
    dealer = await prisma.dealer.create({
      data: {
        businessName: `Field Test ${tag}`,
        contactName: name,
        phone: tag === "A" ? "0500000001" : "0500000002",
        email,
        verificationStatus: "VERIFIED",
        isActive: true,
        cohort: "FIELD_TEST",
      },
    });
  } else {
    await prisma.dealer.update({
      where: { id: dealer.id },
      data: { verificationStatus: "VERIFIED", isActive: true },
    });
  }

  await prisma.dealerMembership.upsert({
    where: { userId_dealerId: { userId: user.id, dealerId: dealer.id } },
    create: { userId: user.id, dealerId: dealer.id, role: "OWNER" },
    update: {},
  });

  // Complete Privacy-AI gate so Field Test pages are reachable (consents = false).
  for (const type of PRIVACY_CONSENT_TYPES) {
    await prisma.privacyConsentDecision.create({
      data: {
        userId: user.id,
        dealerId: dealer.id,
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
      userId: user.id,
      dealerId: dealer.id,
      termsVersion: TERMS_VERSION,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      consentTextVersion: CONSENT_TEXT_VERSION,
      source: "field_test_seed",
    },
  });
  await prisma.privacyAiOnboardingState.upsert({
    where: { userId_dealerId: { userId: user.id, dealerId: dealer.id } },
    create: {
      userId: user.id,
      dealerId: dealer.id,
      completedAt: new Date(),
    },
    update: { completedAt: new Date() },
  });

  console.log(`seeded dealer ${tag}: ${email}`);
}

async function main() {
  await upsertDealer("A", "fieldtest-a@rematcher.local", "Field Test A");
  await upsertDealer("B", "fieldtest-b@rematcher.local", "Field Test B");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

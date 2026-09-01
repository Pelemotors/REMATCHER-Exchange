/**
 * Production admin-approval email URL test.
 * Triggers signup + verify on canonical domain, then reports URL + Resend message ID.
 *
 * Usage:
 *   npx tsx scripts/production-email-url-test.ts
 */
import "dotenv/config";
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { CANONICAL_APP_URL } from "../src/config/app";

const BASE = "https://exchange.rematcher.co.il";
const prisma = new PrismaClient();

async function createVerifyToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await prisma.verificationToken.deleteMany({
    where: { userId, type: "EMAIL_VERIFY", usedAt: null },
  });
  await prisma.verificationToken.create({
    data: { userId, type: "EMAIL_VERIFY", tokenHash, expiresAt },
  });
  return raw;
}

async function main() {
  const ts = Date.now();
  const email = `qa-deliverability+${ts}@galsamama.com`;
  const password = `QaTest!${ts}`;

  console.log("=== Production Email URL Test ===");
  console.log(`Target: ${BASE}`);
  console.log(`Test email: ${email}\n`);

  const signupRes = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "QA Deliverability",
      businessName: `QA Deliverability ${ts}`,
      phone: "0501234567",
      email,
      city: "תל אביב",
      region: "מרכז",
      password,
      confirmPassword: password,
    }),
  });

  if (!signupRes.ok) {
    const body = await signupRes.text();
    throw new Error(`Signup failed ${signupRes.status}: ${body}`);
  }
  console.log("✓ Signup OK");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found in DB");

  const verifyToken = await createVerifyToken(user.id);
  const verifyRes = await fetch(`${BASE}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: verifyToken }),
  });
  if (!verifyRes.ok) {
    const body = await verifyRes.text();
    throw new Error(`Verify failed ${verifyRes.status}: ${body}`);
  }
  console.log("✓ Email verified — admin approval email should fire");

  await new Promise((r) => setTimeout(r, 4000));

  const membership = await prisma.dealerMembership.findFirst({
    where: { userId: user.id },
    select: { dealerId: true },
  });
  const dealerId = membership?.dealerId;
  if (!dealerId) throw new Error("Dealer not found");

  const expectedUrl = `${CANONICAL_APP_URL}/admin/dealers/${dealerId}`;
  const event = await prisma.appEvent.findFirst({
    where: { eventType: "admin_approval_email_sent", dealerId },
    orderBy: { createdAt: "desc" },
  });
  const meta = event?.metadataJson as Record<string, string> | null;

  console.log("\n--- Results ---");
  console.log("Expected admin review URL:", expectedUrl);
  console.log("Resend message ID:", meta?.providerMessageId ?? "NOT FOUND");
  console.log("Recipient:", meta?.recipient ?? "galsamama@gmail.com");
  console.log("Sent at:", meta?.sentAt ?? "unknown");

  if (!meta?.providerMessageId) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

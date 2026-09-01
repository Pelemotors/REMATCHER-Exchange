import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_HOURS = 48;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createEmailVerificationToken(userId: string) {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.verificationToken.deleteMany({
    where: { userId, type: "EMAIL_VERIFY", usedAt: null },
  });

  await prisma.verificationToken.create({
    data: {
      userId,
      type: "EMAIL_VERIFY",
      tokenHash,
      expiresAt,
    },
  });

  return raw;
}

export async function consumeEmailVerificationToken(token: string) {
  const tokenHash = hashToken(token);
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          memberships: { include: { dealer: true }, take: 1 },
        },
      },
    },
  });

  if (!record || record.type !== "EMAIL_VERIFY" || record.usedAt) {
    return { ok: false as const, reason: "invalid" as const };
  }

  if (record.expiresAt < new Date()) {
    return { ok: false as const, reason: "expired" as const };
  }

  await prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);

  const dealer = record.user.memberships[0]?.dealer ?? null;

  return {
    ok: true as const,
    user: record.user,
    dealer,
  };
}

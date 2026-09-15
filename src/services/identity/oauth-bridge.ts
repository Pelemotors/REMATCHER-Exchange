import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const BRIDGE_TTL_MS = 5 * 60 * 1000;
export const OAUTH_BRIDGE_TYPE = "oauth_bridge";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createOAuthBridgeToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + BRIDGE_TTL_MS);

  await prisma.verificationToken.deleteMany({
    where: { userId, type: OAUTH_BRIDGE_TYPE, usedAt: null },
  });

  await prisma.verificationToken.create({
    data: {
      userId,
      type: OAUTH_BRIDGE_TYPE,
      tokenHash,
      expiresAt,
    },
  });

  return raw;
}

export async function consumeOAuthBridgeToken(token: string) {
  const tokenHash = hashToken(token);
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.type !== OAUTH_BRIDGE_TYPE || record.usedAt) {
    return { ok: false as const, reason: "invalid" as const };
  }
  if (record.expiresAt < new Date()) {
    return { ok: false as const, reason: "expired" as const };
  }

  await prisma.verificationToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return { ok: true as const, userId: record.userId };
}

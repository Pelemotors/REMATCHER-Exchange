import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** NextAuth Credentials-compatible user payload for JWT session. */
export async function sessionPayloadFromUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { dealer: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user) return null;
  return sessionPayloadFromUserRecord(user);
}

export function sessionPayloadFromUserRecord(
  user: User & {
    memberships: Array<{
      dealerId: string;
      dealer: { businessName: string; verificationStatus: string };
    }>;
  }
) {
  const membership = user.memberships[0];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    dealerId: membership?.dealerId ?? null,
    dealerName: membership?.dealer.businessName ?? null,
    verificationStatus: membership?.dealer.verificationStatus ?? null,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  };
}

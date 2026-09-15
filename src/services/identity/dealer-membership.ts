import "server-only";
import { prisma } from "@/lib/prisma";
import type { MembershipRole } from "@prisma/client";

export async function listDealerMembers(dealerId: string) {
  return prisma.dealerMembership.findMany({
    where: { dealerId },
    include: {
      user: { select: { id: true, email: true, name: true, accountStatus: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function requireMembershipRole(
  userId: string,
  dealerId: string,
  roles: MembershipRole[]
) {
  const row = await prisma.dealerMembership.findUnique({
    where: { userId_dealerId: { userId, dealerId } },
  });
  if (!row || !roles.includes(row.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return { ok: true as const, membership: row };
}

/** OWNER adds a member by existing user email. Does not transfer purchases. */
export async function addDealerMember(input: {
  dealerId: string;
  actorUserId: string;
  email: string;
  role: Exclude<MembershipRole, "OWNER">;
}) {
  const gate = await requireMembershipRole(input.actorUserId, input.dealerId, [
    "OWNER",
    "ADMIN",
  ]);
  if (!gate.ok) return { ok: false as const, error: gate.error };

  if (input.role === "ADMIN" && gate.membership.role !== "OWNER") {
    return { ok: false as const, error: "owner_only" as const };
  }

  const user = await prisma.user.findUnique({
    where: { email: input.email.trim().toLowerCase() },
  });
  if (!user) return { ok: false as const, error: "user_not_found" as const };

  const existing = await prisma.dealerMembership.findUnique({
    where: { userId_dealerId: { userId: user.id, dealerId: input.dealerId } },
  });
  if (existing) return { ok: true as const, membership: existing, already: true as const };

  const membership = await prisma.dealerMembership.create({
    data: {
      userId: user.id,
      dealerId: input.dealerId,
      role: input.role,
    },
  });
  return { ok: true as const, membership, already: false as const };
}

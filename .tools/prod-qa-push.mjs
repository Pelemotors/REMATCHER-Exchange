import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.pushSubscription.count();
  const active = await prisma.pushSubscription.count({
    where: { invalidatedAt: null },
  });
  const invalidated = await prisma.pushSubscription.count({
    where: { invalidatedAt: { not: null } },
  });

  const subs = await prisma.pushSubscription.findMany({
    where: { invalidatedAt: null },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      lastUsedAt: true,
      user: { select: { email: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  console.log(
    JSON.stringify(
      {
        total,
        active,
        invalidated,
        subs: subs.map((s) => ({
          subId: `${s.id.slice(0, 8)}…`,
          userId: s.userId,
          email: s.user.email,
          name: s.user.name,
          role: s.user.role,
          createdAt: s.createdAt,
          lastUsedAt: s.lastUsedAt,
        })),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

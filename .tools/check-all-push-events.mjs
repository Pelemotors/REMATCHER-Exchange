import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const recentEvents = await prisma.appEvent.findMany({
    where: {
      eventType: {
        contains: "push",
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      eventType: true,
      source: true,
      entityId: true,
      userId: true,
      createdAt: true,
    },
  });

  const allDeliveries = await prisma.pushDelivery.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      source: true,
      sentAt: true,
      receivedAt: true,
      clickedAt: true,
      destinationOpenedAt: true,
      createdAt: true,
    },
  });

  console.log(JSON.stringify({ recentEvents, allDeliveries }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

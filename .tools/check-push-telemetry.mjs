import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CAMPAIGN_ID = "cmtkjyach000177bob50yqv34";
const DELIVERY_ID = "cmtkjybc7000577bol39msd4u";

async function main() {
  const campaign = await prisma.pushCampaign.findUnique({
    where: { id: CAMPAIGN_ID },
    include: {
      deliveries: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          sendAttemptedAt: true,
          sentAt: true,
          receivedAt: true,
          clickedAt: true,
          destinationOpenedAt: true,
        },
      },
    },
  });

  const events = await prisma.appEvent.findMany({
    where: {
      OR: [
        { entityId: DELIVERY_ID },
        {
          metadataJson: {
            path: ["deliveryId"],
            equals: DELIVERY_ID,
          },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      eventType: true,
      source: true,
      createdAt: true,
      metadataJson: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        campaign: campaign
          ? {
              id: campaign.id,
              source: campaign.source,
              selectedCount: campaign.selectedCount,
              eligibleCount: campaign.eligibleCount,
              sendAttemptedCount: campaign.sendAttemptedCount,
              sentCount: campaign.sentCount,
              receivedCount: campaign.receivedCount,
              clickedCount: campaign.clickedCount,
              destinationOpenedCount: campaign.destinationOpenedCount,
            }
          : null,
        delivery: campaign?.deliveries[0] ?? null,
        events: events.map((e) => ({
          eventType: e.eventType,
          source: e.source,
          createdAt: e.createdAt,
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

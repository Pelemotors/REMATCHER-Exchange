import "server-only";
import { prisma } from "@/lib/prisma";
import type { PushAudienceType, PushSource } from "@prisma/client";
import {
  deliverPushToUser,
  validatePushContent,
} from "@/services/notifications/push";
import { createNotification } from "@/services/notifications";

export type PushEligibilityStatus =
  | "eligible"
  | "no_subscription"
  | "invalidated_only";

export interface AudienceUser {
  id: string;
  email: string;
  name: string;
  role: string;
  dealerNames: string[];
  dealerStatuses: string[];
  hasPushSubscription: boolean;
  subscriptionCount: number;
  pushEligibilityStatus: PushEligibilityStatus;
  eligibilityLabel: string;
}

export interface AudienceResolution {
  selected: AudienceUser[];
  selectedCount: number;
  eligibleCount: number;
  notSubscribedCount: number;
}

export function getPushEligibilityStatus(
  activeSubscriptionCount: number,
  totalSubscriptionCount: number
): PushEligibilityStatus {
  if (activeSubscriptionCount > 0) return "eligible";
  if (totalSubscriptionCount > 0) return "invalidated_only";
  return "no_subscription";
}

export function eligibilityLabelFor(status: PushEligibilityStatus): string {
  switch (status) {
    case "eligible":
      return "זכאי ל-Push";
    case "invalidated_only":
      return "מנוי Push לא זמין";
    default:
      return "ללא מנוי Push פעיל";
  }
}

export function dedupeAudienceUsers(users: AudienceUser[]): AudienceUser[] {
  const seen = new Set<string>();
  return users.filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });
}

function buildNameSearchClauses(query: string) {
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  return tokens.flatMap((token) => [
    { name: { contains: token, mode: "insensitive" as const } },
    { email: { contains: token, mode: "insensitive" as const } },
  ]);
}

function mapUserRow(
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    pushSubs: { id: string; invalidatedAt: Date | null }[];
    memberships: { dealer: { businessName: string; verificationStatus: string } }[];
  }
): AudienceUser {
  const activeSubs = user.pushSubs.filter((s) => !s.invalidatedAt);
  const pushEligibilityStatus = getPushEligibilityStatus(
    activeSubs.length,
    user.pushSubs.length
  );
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    dealerNames: user.memberships.map((m) => m.dealer.businessName),
    dealerStatuses: user.memberships.map((m) => m.dealer.verificationStatus),
    hasPushSubscription: activeSubs.length > 0,
    subscriptionCount: activeSubs.length,
    pushEligibilityStatus,
    eligibilityLabel: eligibilityLabelFor(pushEligibilityStatus),
  };
}

export async function searchAudienceUsers(query: string): Promise<AudienceUser[]> {
  const q = query.trim();
  if (!q || q.length < 1) return [];

  const nameClauses = buildNameSearchClauses(q);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        ...nameClauses,
        {
          memberships: {
            some: {
              dealer: {
                OR: [
                  { businessName: { contains: q, mode: "insensitive" } },
                  { contactName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          },
        },
      ],
    },
    include: {
      pushSubs: true,
      memberships: { include: { dealer: true } },
    },
    take: 50,
    orderBy: { name: "asc" },
  });

  return dedupeAudienceUsers(users.map(mapUserRow));
}

export async function resolveAudience(input: {
  audienceType: PushAudienceType;
  userIds?: string[];
}): Promise<AudienceResolution> {
  let users;

  if (input.audienceType === "ALL") {
    users = await prisma.user.findMany({
      where: {
        role: { in: ["DEALER_USER", "ADMIN"] },
        memberships: {
          some: { dealer: { verificationStatus: "VERIFIED", isActive: true } },
        },
      },
      include: {
        pushSubs: true,
        memberships: { include: { dealer: true } },
      },
    });
  } else {
    const ids = input.userIds ?? [];
    users = await prisma.user.findMany({
      where: { id: { in: ids } },
      include: {
        pushSubs: true,
        memberships: { include: { dealer: true } },
      },
    });
  }

  const selected = dedupeAudienceUsers(users.map(mapUserRow));
  const eligibleCount = selected.filter((u) => u.hasPushSubscription).length;

  return {
    selected,
    selectedCount: selected.length,
    eligibleCount,
    notSubscribedCount: selected.length - eligibleCount,
  };
}

export async function sendAdminCommunication(input: {
  createdByUserId: string;
  title: string;
  body: string;
  destinationLink?: string;
  internalName?: string;
  audienceType: PushAudienceType;
  userIds?: string[];
  source: Extract<PushSource, "ADMIN_CAMPAIGN" | "ADMIN_DIRECT" | "ADMIN_TEST">;
  createInbox?: boolean;
}) {
  const validation = validatePushContent({
    title: input.title,
    body: input.body,
    link: input.destinationLink,
  });
  if (!validation.ok) throw new Error(validation.error);

  const audience = await resolveAudience({
    audienceType: input.audienceType,
    userIds: input.userIds,
  });

  const campaign = await prisma.pushCampaign.create({
    data: {
      internalName: input.internalName,
      title: input.title,
      body: input.body,
      destinationLink: input.destinationLink,
      source: input.source,
      audienceType: input.audienceType,
      audienceDefinitionJson: {
        userIds: input.userIds ?? null,
        resolvedIds: audience.selected.map((u) => u.id),
      },
      createdByUserId: input.createdByUserId,
      selectedCount: audience.selectedCount,
      eligibleCount: audience.eligibleCount,
      sentAt: new Date(),
    },
  });

  let sendAttempted = 0;
  let sent = 0;
  let failed = 0;

  for (const user of audience.selected) {
    let notificationId: string | undefined;

    if (input.createInbox !== false && input.source !== "ADMIN_TEST") {
      const notif = await createNotification({
        userId: user.id,
        type: "SYSTEM",
        title: input.title,
        body: input.body,
        link: input.destinationLink,
        sourceCategory: "ADMIN",
        pushSource: input.source,
        pushTriggerType: "ADMIN_MANUAL",
        sendPush: false,
      });
      notificationId = notif.id;
    }

    if (!user.hasPushSubscription) continue;

    sendAttempted += user.subscriptionCount;
    const result = await deliverPushToUser({
      userId: user.id,
      title: input.title,
      body: input.body,
      link: input.destinationLink,
      source: input.source,
      triggerType: "ADMIN_MANUAL",
      campaignId: campaign.id,
      notificationId,
    });
    sent += result.sent;
    failed += result.failed;
  }

  await prisma.pushCampaign.update({
    where: { id: campaign.id },
    data: {
      sendAttemptedCount: sendAttempted,
      sentCount: sent,
      failedCount: failed,
    },
  });

  return { campaignId: campaign.id, audience, sendAttempted, sent, failed };
}

export async function getCampaignHistory(limit = 20) {
  return prisma.pushCampaign.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function getCampaignDetail(campaignId: string) {
  const campaign = await prisma.pushCampaign.findUnique({
    where: { id: campaignId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      deliveries: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!campaign) return null;

  const funnel = {
    selected: campaign.selectedCount,
    eligible: campaign.eligibleCount,
    sendAttempted: campaign.sendAttemptedCount,
    sent: campaign.sentCount,
    failed: campaign.failedCount,
    received: campaign.receivedCount,
    clicked: campaign.clickedCount,
    destinationOpened: campaign.destinationOpenedCount,
    receivedPct:
      campaign.sentCount > 0
        ? Math.round((campaign.receivedCount / campaign.sentCount) * 100)
        : null,
    clickedPct:
      campaign.receivedCount > 0
        ? Math.round((campaign.clickedCount / campaign.receivedCount) * 100)
        : null,
  };

  const recipients = campaign.deliveries.map((d) => ({
    userId: d.userId,
    name: d.user.name,
    email: d.user.email,
    status: d.status,
    failureCategory: d.failureCategory,
    sentAt: d.sentAt,
    receivedAt: d.receivedAt,
    clickedAt: d.clickedAt,
    destinationOpenedAt: d.destinationOpenedAt,
  }));

  const notEligible = (
    (campaign.audienceDefinitionJson as { resolvedIds?: string[] })?.resolvedIds ?? []
  ).filter(
    (uid) => !campaign.deliveries.some((d) => d.userId === uid && d.pushSubscriptionId)
  );

  return { campaign, funnel, recipients, notEligibleUserIds: notEligible };
}

export async function getPushSubscriberStats() {
  const [totalUsers, subscribedUsers, totalSubscriptions] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: { pushSubs: { some: { invalidatedAt: null } } },
    }),
    prisma.pushSubscription.count({ where: { invalidatedAt: null } }),
  ]);

  return {
    totalUsers,
    subscribedUsers,
    notSubscribedUsers: totalUsers - subscribedUsers,
    totalSubscriptions,
  };
}

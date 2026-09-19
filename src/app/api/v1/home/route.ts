import { requireV1Dealer } from "@/lib/api-v1/auth";
import { v1Json } from "@/lib/api-v1/respond";
import { getWorkCenterSnapshot } from "@/services/dealer/work-center";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1Dealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const snapshot = await getWorkCenterSnapshot(principal.dealerId, principal.userId);
  return v1Json(ctx, {
    actionItems: snapshot.actionItems,
    activeDemands: snapshot.activeDemands,
    inventoryCount: snapshot.inventoryCount,
    matches: snapshot.matches,
    opportunities: snapshot.opportunities,
    pendingOutcomes: snapshot.pendingOutcomes,
    recentReveals: snapshot.recentReveals,
    connectionsLabel: snapshot.connectionsLabel,
    connectionsSecondary: snapshot.connectionsSecondary,
    setupStatus: snapshot.setupStatus,
    notifications: snapshot.notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      link: n.link,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt ? n.readAt.toISOString() : null,
    })),
    unreadNotificationCount: snapshot.notifications.filter((n) => !n.readAt)
      .length,
    actionCenter: snapshot.actionCenter,
  });
}

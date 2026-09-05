/**
 * Lifecycle catch-up — safe to run after downtime / missed schedules.
 * Idempotent via domain transitions + AppEvent keys in reminders.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { expireStaleDemands } from "@/services/domain/matching-flow";
import { runSmartReminders } from "@/services/reminders/smart-reminders";
import { logEvent } from "@/services/events/log-event";

export async function runLifecycleCatchUp(params?: {
  source?: string;
}): Promise<{
  expiredDemands: number;
  remindersSent: number;
  overdueDemandsFound: number;
  cancelledEnrichmentOnSold: number;
  revealsRecovered: number;
  closedStaleOpportunities: number;
}> {
  const now = new Date();
  const overdueDemandsFound = await prisma.demand.count({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
  });

  // Global catch-up — no dealerId filter (scheduler recovery)
  const expiredDemands = await expireStaleDemands();
  const { sent: remindersSent } = await runSmartReminders();

  const { reconcilePilotInconsistencies } = await import(
    "@/services/ops/pilot-reconciliation"
  );
  const reconciliation = await reconcilePilotInconsistencies();

  await logEvent({
    eventType: "lifecycle_catchup_completed",
    entityType: "System",
    entityId: "lifecycle",
    source: params?.source ?? "cron",
    metadata: {
      expiredDemands,
      remindersSent,
      overdueDemandsFound,
      ...reconciliation,
      at: now.toISOString(),
    },
  });

  return {
    expiredDemands,
    remindersSent,
    overdueDemandsFound,
    ...reconciliation,
  };
}

export async function getLastLifecycleCatchUp(): Promise<{
  at: string | null;
  metadata: Record<string, unknown> | null;
}> {
  const row = await prisma.appEvent.findFirst({
    where: { eventType: "lifecycle_catchup_completed" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, metadataJson: true },
  });
  return {
    at: row?.createdAt.toISOString() ?? null,
    metadata: (row?.metadataJson as Record<string, unknown>) ?? null,
  };
}

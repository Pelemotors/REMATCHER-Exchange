import "server-only";
import { prisma } from "@/lib/prisma";
import { logAppEvent, notifyDealerUsers } from "@/services/notifications";
import { emitExchangeEvent } from "@/services/exchange/events";
import { applyVehicleSoldLifecycle } from "@/services/inventory/sold-lifecycle";
import type {
  InventoryDbClient,
  InventoryMutationSource,
} from "@/services/inventory/create-vehicle";

/**
 * Canonical mark-sold for Dealer inventory.
 * UI / API / Agent / Import / Validation must use this — never raw status=SOLD.
 *
 * Durability: Vehicle SOLD + VEHICLE_SOLD ExchangeEvent in one transaction.
 * Heavy lifecycle (close opps/matches) runs after durable enqueue; idempotent.
 */
export async function markVehicleSoldForDealer(input: {
  dealerId: string;
  vehicleId: string;
  source?: InventoryMutationSource | string;
  skipEventLog?: boolean;
  userId?: string | null;
  db?: InventoryDbClient;
}) {
  const db = input.db ?? prisma;

  const vehicle = await db.vehicle.findFirst({
    where: {
      id: input.vehicleId,
      dealerId: input.dealerId,
      status: { not: "ARCHIVED" },
    },
  });

  if (!vehicle) {
    return { ok: false as const, error: "not_found" as const };
  }

  if (vehicle.status === "SOLD") {
    // Ensure lifecycle converged even if a prior run partially failed
    if (!input.skipEventLog) {
      await applyVehicleSoldLifecycle({
        vehicleId: vehicle.id,
        dealerId: input.dealerId,
        source: String(input.source ?? "domain"),
      }).catch(() => undefined);
    }
    return { ok: true as const, vehicle, alreadySold: true as const };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.vehicle.update({
      where: { id: vehicle.id },
      data: { status: "SOLD", archivedAt: new Date() },
    });

    if (!input.skipEventLog) {
      await emitExchangeEvent(
        {
          eventType: "VEHICLE_SOLD",
          dealerId: input.dealerId,
          vehicleId: row.id,
          evidenceType: "SYSTEM_OBSERVED",
          privacyClass: "DEALER_SCOPED",
          eventData: { source: input.source ?? "domain" },
          idempotencyKey: `vehicle-sold:${row.id}`,
        },
        tx
      );
    }

    return row;
  });

  if (!input.skipEventLog) {
    await logAppEvent({
      eventType: "vehicle_marked_sold",
      entityType: "Vehicle",
      entityId: updated.id,
      dealerId: input.dealerId,
      metadata: { source: input.source ?? "domain" },
    });

    // Lifecycle must not be swallowed silently — retry-safe via alreadySold path
    await applyVehicleSoldLifecycle({
      vehicleId: updated.id,
      dealerId: input.dealerId,
      source: String(input.source ?? "domain"),
    });

    // Bounded Agent follow-up opportunity (domain-driven, not LLM guess)
    const title = `${updated.make ?? ""} ${updated.model ?? ""} ${updated.year ?? ""}`.trim();
    await notifyDealerUsers(input.dealerId, {
      type: "SYSTEM",
      title: "הרכב סומן כנמכר",
      body: `${title || "הרכב"} הוסר מהמלאי הפעיל. נמכר דרך חיבור של REMATCHER? אפשר גם להוסיף מלאי חדש.`,
      link: `/inventory?focus=${updated.id}&filter=sold`,
      entityType: "Vehicle",
      entityId: updated.id,
      sendPush: false,
    }).catch(() => undefined);
  }

  return { ok: true as const, vehicle: updated, alreadySold: false as const };
}

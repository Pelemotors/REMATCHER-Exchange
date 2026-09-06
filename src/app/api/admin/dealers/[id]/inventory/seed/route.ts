import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth-guards";
import { createVehicleForDealer } from "@/services/inventory/create-vehicle";
import { rematchInventoryBatch } from "@/services/matching/inventory-rematch";
import { logAppEvent } from "@/services/notifications";

const MAX_ROWS = 40;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id: dealerId } = await params;
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    include: {
      memberships: {
        where: { role: "OWNER" },
        select: { userId: true },
        take: 1,
      },
    },
  });
  if (!dealer) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { inventory?: string } | null;
  const lines = (body?.inventory ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return NextResponse.json({ error: "inventory_required" }, { status: 400 });
  }
  if (lines.length > MAX_ROWS) {
    return NextResponse.json(
      { error: "too_many_rows", maxRows: MAX_ROWS },
      { status: 400 }
    );
  }

  const ownerUserId = dealer.memberships[0]?.userId;
  const createdIds: string[] = [];
  const failed: Array<{ line: string; error: string }> = [];

  // Keep this sequential: normalization can use the configured AI model and we do not
  // want an onboarding paste to fan out dozens of concurrent model calls.
  for (const line of lines) {
    const result = await createVehicleForDealer({
      dealerId,
      userId: ownerUserId,
      rawInput: line,
      normalizeFromRaw: true,
      source: "import",
      requireIdentity: true,
      lastAvailabilityConfirmedAt: new Date(),
      skipRematch: true,
    });

    if (result.ok) createdIds.push(result.vehicle.id);
    else failed.push({ line, error: result.error });
  }

  if (createdIds.length > 0) {
    await rematchInventoryBatch({
      vehicleIds: createdIds,
      sellerDealerId: dealerId,
    });
  }

  await logAppEvent({
    eventType: "admin_inventory_seeded",
    dealerId,
    entityType: "Dealer",
    entityId: dealerId,
    metadata: {
      adminUserId: authResult.session.user.id,
      requested: lines.length,
      created: createdIds.length,
      failed: failed.length,
    },
  });

  return NextResponse.json({
    ok: true,
    requested: lines.length,
    created: createdIds.length,
    failed,
  });
}

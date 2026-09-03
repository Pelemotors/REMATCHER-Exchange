import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createVehicleForDealer } from "@/services/inventory/create-vehicle";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dealerId = session.user.dealerId;

  const [vehicles, openOpps, pendingValidations] = await Promise.all([
    prisma.vehicle.findMany({
      where: { dealerId, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        mileage: true,
        b2bPrice: true,
        retailPrice: true,
        trim: true,
        color: true,
        status: true,
        freshnessState: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
    prisma.sellerOpportunity.groupBy({
      by: ["vehicleId"],
      where: { vehicle: { dealerId }, status: "OPEN" },
      _count: { _all: true },
    }),
    prisma.validationEvent.groupBy({
      by: ["vehicleId"],
      where: { dealerId, status: "PENDING" },
      _count: { _all: true },
    }),
  ]);

  const oppByVehicle = new Map(
    openOpps.map((o) => [o.vehicleId, o._count._all])
  );
  const valByVehicle = new Map(
    pendingValidations.map((v) => [v.vehicleId, v._count._all])
  );

  const enriched = vehicles.map((v) => ({
    ...v,
    openInterestCount: oppByVehicle.get(v.id) ?? 0,
    pendingValidationCount: valByVehicle.get(v.id) ?? 0,
  }));

  const snapshot = {
    total: enriched.filter((v) => v.status === "ACTIVE").length,
    needsAttention: enriched.filter(
      (v) =>
        v.status === "ACTIVE" &&
        (v.freshnessState === "STALE" ||
          v.freshnessState === "VALIDATION_REQUIRED" ||
          v.pendingValidationCount > 0 ||
          (v.b2bPrice == null && v.retailPrice == null))
    ).length,
    withInterest: enriched.filter((v) => v.openInterestCount > 0).length,
    pendingValidation: enriched.filter((v) => v.pendingValidationCount > 0)
      .length,
  };

  return NextResponse.json({ vehicles: enriched, snapshot });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { rawInput, ...manualFields } = body;

  const result = await createVehicleForDealer({
    dealerId: session.user.dealerId,
    userId: session.user.id,
    rawInput: rawInput ?? null,
    normalizeFromRaw: Boolean(rawInput),
    fields: rawInput
      ? undefined
      : {
          make: manualFields.make ?? null,
          model: manualFields.model ?? null,
          trim: manualFields.trim ?? null,
          year: manualFields.year ?? null,
          mileage: manualFields.mileage ?? null,
          color: manualFields.color ?? null,
          ownershipHand: manualFields.ownershipHand ?? null,
          retailPrice: manualFields.retailPrice ?? null,
          b2bPrice: manualFields.b2bPrice ?? null,
          region: manualFields.region ?? null,
        },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json(result.vehicle);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { vehicleId, status, fields } = body as {
    vehicleId?: string;
    status?: string;
    fields?: Record<string, unknown>;
  };

  if (!vehicleId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (status === "SOLD") {
    const { markVehicleSoldForDealer } = await import(
      "@/services/inventory/mark-sold"
    );
    const result = await markVehicleSoldForDealer({
      dealerId: session.user.dealerId,
      vehicleId,
      source: "inventory_api",
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, vehicle: result.vehicle });
  }

  if (fields && typeof fields === "object") {
    const { updateVehicleForDealer } = await import(
      "@/services/inventory/update-vehicle"
    );
    const result = await updateVehicleForDealer({
      dealerId: session.user.dealerId,
      vehicleId,
      fields: {
        make: fields.make as string | null | undefined,
        model: fields.model as string | null | undefined,
        trim: fields.trim as string | null | undefined,
        year: fields.year as number | null | undefined,
        mileage: fields.mileage as number | null | undefined,
        color: fields.color as string | null | undefined,
        ownershipHand: fields.ownershipHand as number | null | undefined,
        retailPrice: fields.retailPrice as number | null | undefined,
        b2bPrice: fields.b2bPrice as number | null | undefined,
        region: fields.region as string | null | undefined,
        status: fields.status as "ACTIVE" | "SOLD" | undefined,
      },
      source: "inventory_api",
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, vehicle: result.vehicle });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

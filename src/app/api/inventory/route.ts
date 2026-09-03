import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createVehicleForDealer } from "@/services/inventory/create-vehicle";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { dealerId: session.user.dealerId, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(vehicles);
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

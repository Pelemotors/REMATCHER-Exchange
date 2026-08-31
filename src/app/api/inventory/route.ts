import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { normalizeVehicle, normalizedToVehicleFields } from "@/services/ai";

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

  let fields = {
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
    fieldProvenance: null as unknown,
  };

  if (rawInput) {
    const normalized = await normalizeVehicle(rawInput, session.user.id);
    fields = normalizedToVehicleFields(normalized);
    fields.fieldProvenance = normalized;
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      dealerId: session.user.dealerId,
      rawInput: rawInput ?? null,
      ...fields,
      fieldProvenance: fields.fieldProvenance
        ? toPrismaJson(fields.fieldProvenance)
        : undefined,
      freshnessState: "FRESH",
      lastInventoryUpdate: new Date(),
    },
  });

  return NextResponse.json(vehicle);
}

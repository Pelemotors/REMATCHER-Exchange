import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  deleteVehicleMediaForDealer,
  listVehicleMediaForDealer,
  reorderVehicleMediaForDealer,
  setPrimaryVehicleMediaForDealer,
  uploadVehicleImageForDealer,
} from "@/services/inventory/vehicle-media";
import type { VehicleMediaCategory } from "@prisma/client";

const CATEGORIES = new Set(["EXTERIOR", "INTERIOR", "OTHER"]);

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const vehicleId = new URL(req.url).searchParams.get("vehicleId");
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId required" }, { status: 400 });
  }
  const result = await listVehicleMediaForDealer({
    dealerId: session.user.dealerId,
    vehicleId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const vehicleId = String(form.get("vehicleId") ?? "");
  const categoryRaw = String(form.get("category") ?? "");
  const file = form.get("file");

  if (!vehicleId || !CATEGORIES.has(categoryRaw) || !(file instanceof File)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await uploadVehicleImageForDealer({
    dealerId: session.user.dealerId,
    vehicleId,
    category: categoryRaw as VehicleMediaCategory,
    file,
  });

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "limit"
          ? 413
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const mediaId = new URL(req.url).searchParams.get("mediaId");
  if (!mediaId) {
    return NextResponse.json({ error: "mediaId required" }, { status: 400 });
  }
  const result = await deleteVehicleMediaForDealer({
    dealerId: session.user.dealerId,
    mediaId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    mediaId?: string;
    vehicleId?: string;
    orderedMediaIds?: string[];
  };

  if (body.action === "setPrimary" && body.mediaId) {
    const result = await setPrimaryVehicleMediaForDealer({
      dealerId: session.user.dealerId,
      mediaId: body.mediaId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json(result);
  }

  if (
    body.action === "reorder" &&
    body.vehicleId &&
    Array.isArray(body.orderedMediaIds)
  ) {
    const result = await reorderVehicleMediaForDealer({
      dealerId: session.user.dealerId,
      vehicleId: body.vehicleId,
      orderedMediaIds: body.orderedMediaIds,
    });
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "invalid_request" }, { status: 400 });
}

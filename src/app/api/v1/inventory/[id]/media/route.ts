import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  deleteVehicleMediaForDealer,
  listVehicleMediaForDealer,
  reorderVehicleMediaForDealer,
  setPrimaryVehicleMediaForDealer,
  uploadVehicleImageForDealer,
} from "@/services/inventory/vehicle-media";
import type { VehicleMediaCategory } from "@prisma/client";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["EXTERIOR", "INTERIOR", "OTHER"]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id: vehicleId } = await params;

  const result = await listVehicleMediaForDealer({
    dealerId: principal.dealerId,
    vehicleId,
  });
  if (!result.ok) {
    return v1Error(ctx, "RESOURCE_NOT_FOUND");
  }
  return v1Json(ctx, result);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id: vehicleId } = await params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const categoryRaw = String(form.get("category") ?? "");
  const file = form.get("file");

  if (!CATEGORIES.has(categoryRaw) || !(file instanceof File)) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const result = await uploadVehicleImageForDealer({
    dealerId: principal.dealerId,
    vehicleId,
    category: categoryRaw as VehicleMediaCategory,
    file,
  });

  if (!result.ok) {
    if (result.error === "not_found") {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    if (result.error === "limit") {
      return v1Error(ctx, "VALIDATION_FAILED");
    }
    return v1Error(ctx, "VALIDATION_FAILED");
  }

  return v1Json(ctx, result, 201);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  void params; // vehicle ownership enforced inside service via mediaId
  const mediaId = new URL(req.url).searchParams.get("mediaId");
  if (!mediaId) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const result = await deleteVehicleMediaForDealer({
    dealerId: principal.dealerId,
    mediaId,
  });
  if (!result.ok) {
    return v1Error(ctx, "RESOURCE_NOT_FOUND");
  }
  return v1Json(ctx, result);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id: vehicleId } = await params;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    action?: string;
    mediaId?: string;
    orderedMediaIds?: string[];
  };

  if (body.action === "setPrimary" && body.mediaId) {
    const result = await setPrimaryVehicleMediaForDealer({
      dealerId: principal.dealerId,
      mediaId: body.mediaId,
    });
    if (!result.ok) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    return v1Json(ctx, result);
  }

  if (body.action === "reorder" && Array.isArray(body.orderedMediaIds)) {
    const result = await reorderVehicleMediaForDealer({
      dealerId: principal.dealerId,
      vehicleId,
      orderedMediaIds: body.orderedMediaIds,
    });
    if (!result.ok) {
      return v1Error(
        ctx,
        result.error === "not_found" ? "RESOURCE_NOT_FOUND" : "VALIDATION_FAILED"
      );
    }
    return v1Json(ctx, result);
  }

  return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
}

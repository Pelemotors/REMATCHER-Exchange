import { z } from "zod";
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { createVehicleForDealer } from "@/services/inventory/create-vehicle";
import {
  getInventoryList,
  type InventoryFilter,
} from "@/services/inventory/list-inventory";

export const dynamic = "force-dynamic";

const FILTERS: InventoryFilter[] = [
  "all",
  "active",
  "sold",
  "attention",
  "interest",
  "missing_price",
  "owned",
  "review",
];

const patchSchema = z
  .object({
    vehicleId: z.string().min(1).max(80),
    status: z.enum(["SOLD", "ARCHIVED"]).optional(),
    fields: z
      .object({
        make: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        trim: z.string().nullable().optional(),
        year: z.number().int().min(1980).max(2100).nullable().optional(),
        mileage: z.number().int().min(0).max(2_000_000).nullable().optional(),
        color: z.string().nullable().optional(),
        ownershipHand: z.number().int().min(0).max(20).nullable().optional(),
        retailPrice: z.number().int().min(0).nullable().optional(),
        b2bPrice: z.number().int().min(0).nullable().optional(),
        region: z.string().nullable().optional(),
        conditionNotes: z.string().max(2000).nullable().optional(),
      })
      .strict()
      .optional(),
    reactivate: z.boolean().optional(),
  })
  .strict();

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const url = new URL(req.url);
  const filterRaw = url.searchParams.get("filter") ?? "active";
  if (!FILTERS.includes(filterRaw as InventoryFilter)) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limitRaw = Number(url.searchParams.get("limit") ?? "30") || 30;
  const pageSize = Math.min(100, Math.max(1, limitRaw));
  const q = url.searchParams.get("q") ?? undefined;

  const result = await getInventoryList({
    dealerId: principal.dealerId,
    page,
    pageSize,
    filter: filterRaw as InventoryFilter,
    q,
  });

  return v1Json(ctx, {
    items: result.vehicles,
    snapshot: result.snapshot,
    page: {
      limit: result.pagination.pageSize,
      page: result.pagination.page,
      hasMore: result.pagination.hasMore,
      nextCursor: result.pagination.hasMore
        ? String(result.pagination.page + 1)
        : null,
      sort: "updatedAt:desc",
    },
  });
}

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Record<string, unknown>;
  const rawInput =
    typeof body.rawInput === "string" ? body.rawInput : null;

  const result = await createVehicleForDealer({
    dealerId: principal.dealerId,
    userId: principal.userId,
    rawInput,
    normalizeFromRaw: Boolean(rawInput),
    fields: rawInput
      ? undefined
      : {
          make: (body.make as string | null | undefined) ?? null,
          model: (body.model as string | null | undefined) ?? null,
          trim: (body.trim as string | null | undefined) ?? null,
          year: (body.year as number | null | undefined) ?? null,
          mileage: (body.mileage as number | null | undefined) ?? null,
          color: (body.color as string | null | undefined) ?? null,
          ownershipHand:
            (body.ownershipHand as number | null | undefined) ?? null,
          retailPrice: (body.retailPrice as number | null | undefined) ?? null,
          b2bPrice: (body.b2bPrice as number | null | undefined) ?? null,
          region: (body.region as string | null | undefined) ?? null,
        },
  });

  if (!result.ok) {
    return v1Error(ctx, "VALIDATION_FAILED", result.message);
  }
  return v1Json(ctx, result.vehicle, 201);
}

export async function PATCH(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsedJson = await parseV1Json(req, ctx);
  if (!parsedJson.ok) return parsedJson.response;

  const parsed = patchSchema.safeParse(parsedJson.body);
  if (!parsed.success) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const { vehicleId, status, fields, reactivate } = parsed.data;
  const dealerId = principal.dealerId;

  if (status === "SOLD") {
    const { markVehicleSoldForDealer } = await import(
      "@/services/inventory/mark-sold"
    );
    const result = await markVehicleSoldForDealer({
      dealerId,
      vehicleId,
      source: "inventory_api",
      userId: principal.userId,
    });
    if (!result.ok) {
      return v1Error(
        ctx,
        result.error === "not_found" ? "RESOURCE_NOT_FOUND" : "RESOURCE_CONFLICT"
      );
    }
    return v1Json(ctx, {
      ok: true,
      vehicle: result.vehicle,
      alreadySold: result.alreadySold,
    });
  }

  if (status === "ARCHIVED") {
    const { removeVehicleFromInventoryForDealer } = await import(
      "@/services/inventory/remove-from-inventory"
    );
    const result = await removeVehicleFromInventoryForDealer({
      dealerId,
      vehicleId,
      source: "inventory_api",
    });
    if (!result.ok) {
      return v1Error(
        ctx,
        result.error === "not_found" ? "RESOURCE_NOT_FOUND" : "RESOURCE_CONFLICT"
      );
    }
    return v1Json(ctx, { ok: true, vehicle: result.vehicle });
  }

  if (reactivate) {
    const { reactivateVehicleForDealer } = await import(
      "@/services/inventory/update-vehicle"
    );
    const result = await reactivateVehicleForDealer({
      dealerId,
      vehicleId,
      source: "inventory_api",
    });
    if (!result.ok) {
      return v1Error(
        ctx,
        result.error === "not_found" ? "RESOURCE_NOT_FOUND" : "RESOURCE_CONFLICT"
      );
    }
    return v1Json(ctx, { ok: true, vehicle: result.vehicle });
  }

  if (fields) {
    const { updateVehicleForDealer } = await import(
      "@/services/inventory/update-vehicle"
    );
    const result = await updateVehicleForDealer({
      dealerId,
      vehicleId,
      fields,
      source: "inventory_api",
    });
    if (!result.ok) {
      return v1Error(
        ctx,
        result.error === "not_found" ? "RESOURCE_NOT_FOUND" : "VALIDATION_FAILED"
      );
    }
    return v1Json(ctx, { ok: true, vehicle: result.vehicle });
  }

  return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
}

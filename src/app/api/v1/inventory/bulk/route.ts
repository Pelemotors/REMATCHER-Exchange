import { z } from "zod";
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { runBulkInventoryMutation } from "@/services/inventory/bulk-inventory";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    action: z.enum(["archive", "sold"]),
    vehicleIds: z.array(z.string().min(1).max(80)).optional(),
    filter: z
      .object({
        status: z.enum(["ACTIVE", "SOLD"]).optional(),
        q: z.string().max(120).optional(),
      })
      .strict()
      .optional(),
    selectAllMatching: z.boolean().optional(),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = bodySchema.safeParse(parsed.body);
  if (!body.success) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const data = body.data;
  if (
    !data.selectAllMatching &&
    (!data.vehicleIds || data.vehicleIds.length === 0) &&
    !data.filter
  ) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const result = await runBulkInventoryMutation({
    dealerId: principal.dealerId,
    action: data.action,
    vehicleIds: data.vehicleIds,
    filter: data.filter,
    selectAllMatching: data.selectAllMatching,
    source: "v1_inventory_bulk",
  });

  return v1Json(ctx, result);
}

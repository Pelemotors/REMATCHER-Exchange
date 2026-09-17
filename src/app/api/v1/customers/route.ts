import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  archiveCustomer,
  attachDemandToCustomer,
  getCustomerForDealer,
  listCustomersForDealer,
  upsertCustomerForDealer,
} from "@/services/customers";

export const dynamic = "force-dynamic";

/** Thin wrap of Web GET /api/customers — principal.dealerId only. */
export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const row = await getCustomerForDealer(principal.dealerId, id);
    if (!row) return v1Error(ctx, "RESOURCE_NOT_FOUND");
    return v1Json(ctx, row);
  }
  const q = url.searchParams.get("q") ?? undefined;
  const rows = await listCustomersForDealer(principal.dealerId, { q });
  return v1Json(ctx, { customers: rows });
}

/** Thin wrap of Web POST /api/customers */
export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Record<string, unknown>;

  if (body.action === "attach_demand") {
    const result = await attachDemandToCustomer({
      dealerId: principal.dealerId,
      demandId: String(body.demandId ?? ""),
      customerId: String(body.customerId ?? ""),
    });
    if (!result.ok) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    return v1Json(ctx, result);
  }
  if (body.action === "archive") {
    const row = await archiveCustomer(
      principal.dealerId,
      String(body.customerId ?? "")
    );
    if (!row) return v1Error(ctx, "RESOURCE_NOT_FOUND");
    return v1Json(ctx, row);
  }

  const result = await upsertCustomerForDealer({
    dealerId: principal.dealerId,
    name: (body.name as string | null | undefined) ?? null,
    phone: (body.phone as string | null | undefined) ?? null,
    notes: (body.notes as string | null | undefined) ?? null,
    source: (body.source as Record<string, unknown> | undefined) ?? {
      via: "api",
    },
  });
  return v1Json(ctx, result);
}

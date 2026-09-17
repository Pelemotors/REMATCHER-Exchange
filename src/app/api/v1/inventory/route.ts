import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
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
];

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

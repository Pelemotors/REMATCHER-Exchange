import { z } from "zod";
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  createMarketWatch,
  listMarketWatches,
} from "@/services/market-watch/watches";

export const dynamic = "force-dynamic";

const postSchema = z
  .object({
    queryMake: z.string().min(1).max(80),
    queryModel: z.string().min(1).max(80),
    yearMin: z.number().int().min(1980).max(2100).optional(),
    yearMax: z.number().int().min(1980).max(2100).optional(),
  })
  .strict();

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const rows = await listMarketWatches(principal.dealerId);
  return v1Json(ctx, {
    watches: rows.map((w) => ({
      id: w.id,
      queryMake: w.queryMake,
      queryModel: w.queryModel,
      yearMin: w.yearMin,
      yearMax: w.yearMax,
      active: w.active,
      createdAt: w.createdAt.toISOString(),
      lastEvaluatedAt: w.lastEvaluatedAt?.toISOString() ?? null,
      lastNotifiedAt: w.lastNotifiedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = postSchema.safeParse(parsed.body);
  if (!body.success) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  const watch = await createMarketWatch({
    dealerId: principal.dealerId,
    userId: principal.userId,
    queryMake: body.data.queryMake,
    queryModel: body.data.queryModel,
    yearMin: body.data.yearMin,
    yearMax: body.data.yearMax,
  });
  return v1Json(ctx, {
    watch: {
      id: watch.id,
      queryMake: watch.queryMake,
      queryModel: watch.queryModel,
      yearMin: watch.yearMin,
      yearMax: watch.yearMax,
      active: watch.active,
      createdAt: watch.createdAt.toISOString(),
    },
  });
}

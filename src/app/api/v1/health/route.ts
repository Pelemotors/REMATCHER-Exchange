import { resolveV1RequestContext } from "@/lib/api-v1/request-context";
import { v1Json } from "@/lib/api-v1/respond";

export const dynamic = "force-dynamic";

/**
 * Public Mobile health subset. Does not replace GET /api/health (Web).
 * No secrets, no kill-switch internals.
 */
export async function GET(req: Request) {
  const ctx = resolveV1RequestContext(req);
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT ??
    process.env.DEPLOY_SHA ??
    "local";

  return v1Json(ctx, {
    status: "ok",
    apiVersion: "v1",
    requestId: ctx.requestId,
    environment:
      process.env.FIELD_TEST === "true"
        ? "fieldtest"
        : process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    commit: commit.length > 7 ? commit.slice(0, 7) : commit,
  });
}

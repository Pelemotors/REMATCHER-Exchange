import { resolveV1RequestContext } from "@/lib/api-v1/request-context";
import { v1Error } from "@/lib/api-v1/respond";

export const dynamic = "force-dynamic";

/**
 * Mobile identity door. Bearer session lands in B03.
 * Until then this route is unauthenticated → AUTH_UNAUTHENTICATED envelope.
 * Web /api/account/context is unchanged.
 */
export async function GET(req: Request) {
  const ctx = resolveV1RequestContext(req);
  return v1Error(ctx, "AUTH_UNAUTHENTICATED");
}

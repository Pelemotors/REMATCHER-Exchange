import type { V1RequestContext } from "@/lib/api-v1/request-context";
import { v1Error } from "@/lib/api-v1/respond";
import type { NextResponse } from "next/server";

export async function parseV1Json(
  req: Request,
  ctx: V1RequestContext
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    const body = await req.json();
    return { ok: true, body };
  } catch {
    return { ok: false, response: v1Error(ctx, "VALIDATION_INVALID_JSON") };
  }
}

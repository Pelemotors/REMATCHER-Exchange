import { z } from "zod";
import { resolveV1RequestContext } from "@/lib/api-v1/request-context";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { revokeMobileRefresh } from "@/services/identity/mobile-session";

const schema = z.object({
  refreshToken: z.string().min(20).max(400),
});

export async function POST(req: Request) {
  const ctx = resolveV1RequestContext(req);
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  await revokeMobileRefresh(parsed.data.refreshToken);
  return v1Json(ctx, { ok: true });
}

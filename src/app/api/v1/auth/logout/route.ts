import { z } from "zod";
import { resolveV1RequestContext } from "@/lib/api-v1/request-context";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  hashMobileToken,
  revokeMobileRefresh,
} from "@/services/identity/mobile-session";
import { revokeInstallation } from "@/services/devices/installations";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  refreshToken: z.string().min(20).max(400),
  installationId: z.string().min(3).max(120).optional(),
});

export async function POST(req: Request) {
  const ctx = resolveV1RequestContext(req);
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const refreshHash = hashMobileToken(parsed.data.refreshToken);
  const session = await prisma.mobileSession.findUnique({
    where: { refreshTokenHash: refreshHash },
  });

  await revokeMobileRefresh(parsed.data.refreshToken);

  if (session?.userId) {
    await revokeInstallation({
      userId: session.userId,
      installationId: parsed.data.installationId ?? session.installationId ?? undefined,
    });
  }

  return v1Json(ctx, { ok: true });
}

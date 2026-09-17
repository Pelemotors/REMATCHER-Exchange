import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Json } from "@/lib/api-v1/respond";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Thin wrap of Web GET /api/notifications/preferences — principal.userId only. */
export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;

  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: principal.userId },
  });

  return v1Json(
    ctx,
    prefs ?? {
      criticalProduct: true,
      reminders: true,
      adminCommunications: true,
    }
  );
}

/** Thin wrap of Web PATCH /api/notifications/preferences */
export async function PATCH(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as {
    criticalProduct?: boolean;
    reminders?: boolean;
    adminCommunications?: boolean;
  };

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: principal.userId },
    create: {
      userId: principal.userId,
      criticalProduct: body.criticalProduct ?? true,
      reminders: body.reminders ?? true,
      adminCommunications: body.adminCommunications ?? true,
    },
    update: {
      ...(body.criticalProduct !== undefined
        ? { criticalProduct: body.criticalProduct }
        : {}),
      ...(body.reminders !== undefined ? { reminders: body.reminders } : {}),
      ...(body.adminCommunications !== undefined
        ? { adminCommunications: body.adminCommunications }
        : {}),
    },
  });

  return v1Json(ctx, prefs);
}

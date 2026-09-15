import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDealerSession } from "@/lib/auth-guards";
import {
  registerOrUpdateInstallation,
} from "@/services/devices/installations";

const schema = z.object({
  installationId: z.string().min(3),
  platform: z.enum(["IOS", "ANDROID", "WEB"]),
  appVersion: z.string().optional(),
  buildNumber: z.string().optional(),
  pushToken: z.string().optional(),
  pushProvider: z.enum(["APNS", "FCM", "WEB_PUSH"]).optional(),
  pushPermission: z
    .enum(["UNKNOWN", "GRANTED", "DENIED", "PROVISIONAL"])
    .optional(),
});

export async function POST(req: Request) {
  const authz = await requireDealerSession();
  if ("error" in authz) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const row = await registerOrUpdateInstallation({
    ...parsed.data,
    userId: authz.session.user.id,
    dealerId: authz.session.user.dealerId,
  });

  return NextResponse.json({ ok: true, installation: row });
}

export async function PATCH(req: Request) {
  return POST(req);
}

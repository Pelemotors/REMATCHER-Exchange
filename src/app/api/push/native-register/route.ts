import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  registerNativePushDevice,
  unregisterNativePushDevice,
  type NativePushPlatform,
} from "@/services/notifications/native-push";

function parsePlatform(raw: unknown): NativePushPlatform | null {
  if (raw === "ios" || raw === "android") return raw;
  return null;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const platform = parsePlatform(body.platform);
  const deviceToken =
    typeof body.deviceToken === "string" ? body.deviceToken.trim() : "";

  if (!platform || !deviceToken) {
    return NextResponse.json({ error: "Invalid registration" }, { status: 400 });
  }

  const result = await registerNativePushDevice({
    userId: session.user.id,
    registration: { platform, deviceToken },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason || "register_failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    deliveryReady: Boolean(
      process.env.NEXT_PUBLIC_NATIVE_PUSH_READY === "true" ||
        process.env.FCM_SERVER_KEY ||
        process.env.APNS_KEY_ID
    ),
  });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const platform = parsePlatform(body.platform);
  const deviceToken =
    typeof body.deviceToken === "string" ? body.deviceToken.trim() : "";
  if (!platform || !deviceToken) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const ok = await unregisterNativePushDevice({
    userId: session.user.id,
    platform,
    deviceToken,
  });
  return NextResponse.json({ ok });
}

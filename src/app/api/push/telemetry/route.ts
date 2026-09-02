import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordPushTelemetry } from "@/services/notifications/push";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { deliveryId, event } = body as {
    deliveryId?: string;
    event?: "received" | "clicked" | "destination_opened";
  };

  if (!deliveryId || !event) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const ok = await recordPushTelemetry(
    deliveryId,
    event,
    session.user.id
  );

  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

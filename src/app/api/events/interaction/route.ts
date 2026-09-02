import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logEvent } from "@/services/events/log-event";
import { PRODUCT_EVENTS } from "@/services/events/contract";

const ALLOWED_EVENTS = new Set([
  PRODUCT_EVENTS.MATCH_OPENED,
  PRODUCT_EVENTS.REVEAL_OPENED,
  PRODUCT_EVENTS.NOTIFICATION_READ,
]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { eventType, entityType, entityId, dealerId } = body as {
    eventType?: string;
    entityType?: string;
    entityId?: string;
    dealerId?: string;
  };

  if (!eventType || !ALLOWED_EVENTS.has(eventType as typeof PRODUCT_EVENTS.MATCH_OPENED)) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const result = await logEvent({
    eventType,
    userId: session.user.id,
    dealerId,
    entityType,
    entityId,
    source: "interaction",
  });

  return NextResponse.json({ ok: true, created: result.created });
}

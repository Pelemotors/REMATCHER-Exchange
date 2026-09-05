import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  confirmAccountDeletion,
  requestAccountDeletion,
} from "@/services/privacy/deletion";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;

  if (action === "request") {
    const result = await requestAccountDeletion({
      userId: session.user.id,
      dealerId: session.user.dealerId,
      note: typeof body?.note === "string" ? body.note : undefined,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status: 403 }
      );
    }
    return NextResponse.json(result);
  }

  if (action === "confirm") {
    const requestId =
      typeof body?.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }
    const result = await confirmAccountDeletion({
      userId: session.user.id,
      dealerId: session.user.dealerId,
      requestId,
    });
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 403;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json(
    { error: "action must be request or confirm" },
    { status: 400 }
  );
}

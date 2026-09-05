import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  correctMemory,
  forgetMemory,
} from "@/services/assistant/dealer-memory";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const summary = typeof body?.summary === "string" ? body.summary.trim() : "";
  if (!summary) {
    return NextResponse.json({ error: "summary required" }, { status: 400 });
  }

  const result = await correctMemory({
    dealerId: session.user.dealerId,
    memoryId: id,
    summary,
    details:
      body?.details && typeof body.details === "object" ? body.details : undefined,
    kind: body?.kind,
    confidence: body?.confidence,
    expiresAt: body?.expiresAt,
    evidenceNote: body?.evidenceNote,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.mutation.reason ?? "failed" },
      { status: 404 }
    );
  }
  return NextResponse.json(result);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await forgetMemory({
    dealerId: session.user.dealerId,
    memoryId: id,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.mutation.reason ?? "not_found" },
      { status: 404 }
    );
  }
  return NextResponse.json(result);
}

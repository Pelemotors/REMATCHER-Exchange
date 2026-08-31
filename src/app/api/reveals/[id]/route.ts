import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getRevealForDealer,
  submitOutcome,
} from "@/services/commercial/reveal-flow";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const reveal = await getRevealForDealer(id, session.user.dealerId);
    return NextResponse.json(reveal);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { status, notes } = await req.json();

  try {
    const outcome = await submitOutcome({
      revealId: id,
      dealerId: session.user.dealerId,
      status,
      notes,
    });
    return NextResponse.json(outcome);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
}

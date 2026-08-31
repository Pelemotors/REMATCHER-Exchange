import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDealerUsageSummary } from "@/services/commercial/reveal-usage";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usage = await getDealerUsageSummary(session.user.dealerId);
  return NextResponse.json(usage);
}

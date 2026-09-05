import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { getPilotCandidateDiagnostic } from "@/services/admin/pilot-candidate-diagnostic";
import { getPilotFunnelMetrics } from "@/services/activation/pilot-funnel";

export async function GET(req: Request) {
  const authResult = await requireAdminSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { searchParams } = new URL(req.url);
  const candidateMatchId = searchParams.get("candidateMatchId");
  const funnel = searchParams.get("funnel") === "1";

  if (funnel) {
    const metrics = await getPilotFunnelMetrics();
    return NextResponse.json({ funnel: metrics });
  }

  if (!candidateMatchId) {
    return NextResponse.json(
      { error: "candidateMatchId or funnel=1 required" },
      { status: 400 }
    );
  }

  const diagnostic = await getPilotCandidateDiagnostic(candidateMatchId);
  if (!diagnostic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ diagnostic });
}

import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import {
  listOpenIntakeReviews,
  resolveIntakeCandidate,
} from "@/services/intake/review";
import { checkIntakeRateLimit } from "@/services/intake/rate-limit";
import type { VehicleMediaCategory } from "@prisma/client";

export async function GET() {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }
  const items = await listOpenIntakeReviews(
    authResult.session.user.dealerId!
  );
  return NextResponse.json({ candidates: items });
}

export async function POST(req: Request) {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }
  const dealerId = authResult.session.user.dealerId!;
  const limited = checkIntakeRateLimit({ dealerId, kind: "resolve" });
  if (limited.blocked) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    candidateId?: string;
    detectedPlate?: string | null;
    mediaCategories?: Array<{ mediaId: string; category: VehicleMediaCategory }>;
    confirmExistingVehicleId?: string | null;
    createNewDespiteExisting?: boolean;
    reject?: boolean;
    askingPrice?: number | null;
  };

  if (!body.candidateId) {
    return NextResponse.json({ error: "candidateId required" }, { status: 400 });
  }

  const result = await resolveIntakeCandidate({
    dealerId,
    candidateId: body.candidateId,
    detectedPlate: body.detectedPlate,
    askingPrice:
      typeof body.askingPrice === "number" ? body.askingPrice : undefined,
    mediaCategories: body.mediaCategories,
    confirmExistingVehicleId: body.confirmExistingVehicleId,
    createNewDespiteExisting: body.createNewDespiteExisting,
    reject: body.reject,
  });

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "needs_confirmation"
          ? 409
          : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  listOpenIntakeReviews,
  resolveIntakeCandidate,
} from "@/services/intake/review";
import { checkIntakeRateLimit } from "@/services/intake/rate-limit";
import type { VehicleMediaCategory } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Thin wrap of Web GET /api/intake/review */
export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const items = await listOpenIntakeReviews(principal.dealerId);
  return v1Json(ctx, { candidates: items });
}

/** Thin wrap of Web POST /api/intake/review */
export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const limited = checkIntakeRateLimit({
    dealerId: principal.dealerId,
    kind: "resolve",
  });
  if (limited.blocked) {
    return v1Error(ctx, "RATE_LIMIT_EXCEEDED");
  }

  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as {
    candidateId?: string;
    detectedPlate?: string | null;
    plate?: string | null;
    mediaCategories?: Array<{
      mediaId: string;
      category: VehicleMediaCategory;
    }>;
    confirmExistingVehicleId?: string | null;
    createNewDespiteExisting?: boolean;
    /** Explicit Review resolve+commit only — plate confirm must NOT set this */
    commitAfterResolve?: boolean;
    reject?: boolean;
    askingPrice?: number | null;
  };

  if (!body.candidateId) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const result = await resolveIntakeCandidate({
    dealerId: principal.dealerId,
    candidateId: body.candidateId,
    detectedPlate: body.detectedPlate ?? body.plate,
    askingPrice:
      typeof body.askingPrice === "number" ? body.askingPrice : undefined,
    mediaCategories: body.mediaCategories,
    confirmExistingVehicleId: body.confirmExistingVehicleId,
    createNewDespiteExisting: body.createNewDespiteExisting,
    commitAfterResolve: body.commitAfterResolve === true,
    reject: body.reject,
  });

  if (!result.ok) {
    if (result.error === "not_found") {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    if (result.error === "needs_confirmation") {
      return v1Error(ctx, "RESOURCE_CONFLICT");
    }
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  return v1Json(ctx, result);
}

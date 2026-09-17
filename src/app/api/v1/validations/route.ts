import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { prisma } from "@/lib/prisma";
import { confirmAvailabilityValidation } from "@/services/domain/matching-flow";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;

  const pending = await prisma.validationEvent.findMany({
    where: {
      dealerId: principal.dealerId,
      status: "PENDING",
    },
    include: {
      vehicle: {
        select: { id: true, make: true, model: true, year: true },
      },
      candidateMatch: {
        include: {
          demand: {
            select: { confirmedJson: true },
          },
        },
      },
    },
  });

  return v1Json(ctx, {
    items: pending.map((v) => ({
      id: v.id,
      type: v.type,
      candidateMatchId: v.candidateMatchId,
      vehicle: v.vehicle,
      candidateMatch: v.candidateMatch
        ? {
            demand: {
              confirmedJson: v.candidateMatch.demand?.confirmedJson ?? null,
            },
          }
        : null,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    validationId?: unknown;
    available?: unknown;
  };
  const validationId =
    typeof body.validationId === "string" ? body.validationId : "";
  if (!validationId || typeof body.available !== "boolean") {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  try {
    await confirmAvailabilityValidation(
      validationId,
      principal.dealerId,
      body.available
    );
    return v1Json(ctx, { ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    throw e;
  }
}

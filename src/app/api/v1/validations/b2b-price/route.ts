import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { runMatchingForDemand } from "@/services/domain/matching-flow";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    validationId?: unknown;
    b2bPrice?: unknown;
  };
  const validationId =
    typeof body.validationId === "string" ? body.validationId : "";
  const price = parseInt(String(body.b2bPrice ?? "").replace(/\D/g, ""), 10);
  if (!validationId || !price || price <= 0) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const validation = await prisma.validationEvent.findFirst({
    where: {
      id: validationId,
      dealerId: principal.dealerId,
      type: "B2B_PRICE",
      status: "PENDING",
    },
    include: { candidateMatch: true, vehicle: true },
  });

  if (!validation) {
    return v1Error(ctx, "RESOURCE_NOT_FOUND");
  }

  await prisma.validationEvent.update({
    where: { id: validationId },
    data: {
      status: "CONFIRMED",
      response: String(price),
      respondedAt: new Date(),
      metadataJson: toPrismaJson({ b2bPrice: price }),
    },
  });

  await prisma.vehicle.update({
    where: { id: validation.vehicleId },
    data: {
      b2bPrice: price,
      b2bPriceConfirmedAt: new Date(),
    },
  });

  if (validation.vehicle.b2bPrice == null) {
    const { recordActivationMilestone } = await import(
      "@/services/activation/milestones"
    );
    void recordActivationMilestone({
      dealerId: principal.dealerId,
      milestone: "FIRST_PRIVATE_PRICE_SET",
      userId: principal.userId,
      entityType: "Vehicle",
      entityId: validation.vehicleId,
    }).catch(() => undefined);
  }

  if (validation.candidateMatchId) {
    await runMatchingForDemand(validation.candidateMatch!.demandId);
    const match = await prisma.candidateMatch.findUnique({
      where: { id: validation.candidateMatchId },
    });
    if (match && match.status !== "HIDDEN" && match.status !== "REJECTED") {
      await prisma.candidateMatch.update({
        where: { id: validation.candidateMatchId },
        data: { status: "VALIDATED" },
      });
    }
  }

  return v1Json(ctx, { ok: true, b2bPrice: price });
}

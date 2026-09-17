import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { parseDemand } from "@/services/ai";
import { recordActivationMilestone } from "@/services/activation/milestones";
import { extractCustomerHintsFromText } from "@/services/capture/customer-extract";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as { rawText?: unknown };
  const rawText = typeof body.rawText === "string" ? body.rawText : "";
  if (!rawText.trim()) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const parsedDemand = await parseDemand(rawText, principal.userId);
  const customerHints = extractCustomerHintsFromText(rawText);

  const demand = await prisma.demand.create({
    data: {
      dealerId: principal.dealerId,
      rawText,
      parsedJson: toPrismaJson(parsedDemand),
      status: "PENDING_CONFIRMATION",
      parsedAt: new Date(),
      networkVisibility: "PRIVATE",
    },
  });

  void recordActivationMilestone({
    dealerId: principal.dealerId,
    milestone: "FIRST_DEMAND_CREATED",
    userId: principal.userId,
    entityType: "Demand",
    entityId: demand.id,
  }).catch(() => undefined);

  return v1Json(
    ctx,
    {
      demandId: demand.id,
      parsed: parsedDemand,
      customerHints: {
        name: customerHints.name,
        phone: customerHints.phone,
        hybridHard: customerHints.hybridHard,
        hybridSoft: customerHints.hybridSoft,
        semanticAlternative: customerHints.semanticAlternative,
      },
    },
    201
  );
}

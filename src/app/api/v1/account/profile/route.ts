import { requireV1Dealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { prisma } from "@/lib/prisma";
import { markOnboardingStep } from "@/services/dealer/onboarding-state";

export const dynamic = "force-dynamic";

const PROFILE_SELECT = {
  businessName: true,
  contactName: true,
  phone: true,
  city: true,
  region: true,
  businessId: true,
} as const;

const ALLOWED_PATCH = [
  "contactName",
  "phone",
  "city",
  "region",
  "businessId",
  "businessName",
] as const;

export async function GET(req: Request) {
  const auth = await requireV1Dealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;

  const dealer = await prisma.dealer.findUnique({
    where: { id: principal.dealerId },
    select: PROFILE_SELECT,
  });
  if (!dealer) return v1Error(ctx, "RESOURCE_NOT_FOUND");
  return v1Json(ctx, dealer);
}

export async function PATCH(req: Request) {
  const auth = await requireV1Dealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as Record<string, unknown>;
  const data: Record<string, string> = {};
  for (const key of ALLOWED_PATCH) {
    if (typeof body[key] === "string" && body[key].trim()) {
      data[key] = body[key].trim();
    }
  }

  if (Object.keys(data).length === 0) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const dealer = await prisma.dealer.update({
    where: { id: principal.dealerId },
    data,
    select: PROFILE_SELECT,
  });

  if (dealer.city && dealer.region) {
    await markOnboardingStep(principal.dealerId, "profile");
  }

  return v1Json(ctx, dealer);
}

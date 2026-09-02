import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markOnboardingStep } from "@/services/dealer/onboarding-state";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const dealerId = session.user.dealerId;

  const allowed = ["contactName", "phone", "city", "region", "businessId", "businessName"];
  const data: Record<string, string> = {};
  for (const key of allowed) {
    if (typeof body[key] === "string" && body[key].trim()) {
      data[key] = body[key].trim();
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const dealer = await prisma.dealer.update({
    where: { id: dealerId },
    data,
  });

  if (dealer.city && dealer.region) {
    await markOnboardingStep(dealerId, "profile");
  }

  return NextResponse.json({
    businessName: dealer.businessName,
    contactName: dealer.contactName,
    phone: dealer.phone,
    city: dealer.city,
    region: dealer.region,
    businessId: dealer.businessId,
  });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.dealerMembership.findFirst({
    where: { userId: session.user.id },
    include: { dealer: true, user: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    dealerName: membership?.dealer.businessName ?? session.user.dealerName,
    verificationStatus: membership?.dealer.verificationStatus ?? "PENDING",
    city: membership?.dealer.city,
    region: membership?.dealer.region,
    phone: membership?.dealer.phone ?? membership?.user.phone,
    businessId: membership?.dealer.businessId,
    contactName: membership?.dealer.contactName,
  });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDemand } from "@/services/ai";
import { toPrismaJson } from "@/lib/prisma-json";
import { recordActivationMilestone } from "@/services/activation/milestones";
import { extractCustomerHintsFromText } from "@/services/capture/customer-extract";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rawText } = await req.json();
  if (!rawText?.trim()) {
    return NextResponse.json({ error: "Text required" }, { status: 400 });
  }

  const parsed = await parseDemand(rawText, session.user.id);
  const customerHints = extractCustomerHintsFromText(rawText);

  const demand = await prisma.demand.create({
    data: {
      dealerId: session.user.dealerId,
      rawText,
      parsedJson: toPrismaJson(parsed),
      status: "PENDING_CONFIRMATION",
      parsedAt: new Date(),
      // Draft stays private until Understanding Result confirmation
      networkVisibility: "PRIVATE",
    },
  });

  void recordActivationMilestone({
    dealerId: session.user.dealerId,
    milestone: "FIRST_DEMAND_CREATED",
    userId: session.user.id,
    entityType: "Demand",
    entityId: demand.id,
  }).catch(() => undefined);

  return NextResponse.json({
    demandId: demand.id,
    parsed,
    customerHints: {
      name: customerHints.name,
      phone: customerHints.phone,
      hybridHard: customerHints.hybridHard,
      hybridSoft: customerHints.hybridSoft,
      semanticAlternative: customerHints.semanticAlternative,
    },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const demands = await prisma.demand.findMany({
    where: { dealerId: session.user.dealerId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(demands);
}

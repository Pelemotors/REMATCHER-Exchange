import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runMatchingForDemand } from "@/services/domain/matching-flow";
import { toPrismaJson } from "@/lib/prisma-json";

/** B2B Price validation — Validation ≠ Interest (I-04) */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { validationId, b2bPrice } = await req.json();
  const price = parseInt(String(b2bPrice).replace(/\D/g, ""), 10);
  if (!price || price <= 0) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });
  }

  const validation = await prisma.validationEvent.findFirst({
    where: {
      id: validationId,
      dealerId: session.user.dealerId,
      type: "B2B_PRICE",
      status: "PENDING",
    },
    include: { candidateMatch: true, vehicle: true },
  });

  if (!validation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  return NextResponse.json({ ok: true, b2bPrice: price });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await prisma.validationEvent.findMany({
    where: {
      dealerId: session.user.dealerId,
      type: "B2B_PRICE",
      status: "PENDING",
    },
    include: {
      vehicle: true,
      candidateMatch: { include: { demand: true } },
    },
  });

  return NextResponse.json(pending);
}

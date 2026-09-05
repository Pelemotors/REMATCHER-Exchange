import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmAvailabilityValidation } from "@/services/domain/matching-flow";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { validationId, available } = await req.json();

  await confirmAvailabilityValidation(
    validationId,
    session.user.dealerId,
    Boolean(available)
  );

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await prisma.validationEvent.findMany({
    where: {
      dealerId: session.user.dealerId,
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

  return NextResponse.json(
    pending.map((v) => ({
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
    }))
  );
}

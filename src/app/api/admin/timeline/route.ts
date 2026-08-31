import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const authResult = await requireAdminSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const matchId = searchParams.get("matchId");

  if (matchId) {
    const events = await prisma.appEvent.findMany({
      where: {
        OR: [
          { entityId: matchId },
          {
            metadataJson: {
              path: ["candidateMatchId"],
              equals: matchId,
            },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return NextResponse.json({ events });
  }

  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: "entityType and entityId required" },
      { status: 400 }
    );
  }

  const events = await prisma.appEvent.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return NextResponse.json({ events });
}

import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { getEnrichedDemandsForDealer } from "@/services/demand/demand-queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id } = await params;
  const all = await getEnrichedDemandsForDealer(
    authResult.session.user.dealerId!,
    { includeHistory: true }
  );
  const demand = all.find((d) => d.id === id);
  if (!demand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(demand);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id } = await params;
  const dealerId = authResult.session.user.dealerId!;
  const body = await req.json();
  const { confirmed } = body;

  const demand = await prisma.demand.findFirst({
    where: { id, dealerId },
  });
  if (!demand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { updateDemandForDealer } = await import(
    "@/services/demand/demand-mutations"
  );
  const result = await updateDemandForDealer({
    dealerId,
    demandId: id,
    confirmed,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "Cannot edit" }, { status: 400 });
  }
  return NextResponse.json(result.demand);
}

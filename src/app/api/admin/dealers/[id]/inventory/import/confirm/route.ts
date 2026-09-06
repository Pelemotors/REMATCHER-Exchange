import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth-guards";
import { confirmImport } from "@/services/inventory/import";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id: dealerId } = await params;
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { id: true },
  });
  if (!dealer) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    importId?: string;
    rowIndices?: number[];
    markMissingAsSold?: boolean;
  } | null;

  if (!body?.importId) {
    return NextResponse.json({ error: "importId required" }, { status: 400 });
  }

  try {
    const result = await confirmImport({
      dealerId,
      importId: body.importId,
      rowIndices: body.rowIndices,
      markMissingAsSold: Boolean(body.markMissingAsSold),
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "IMPORT_FAILED";
    const status = msg === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

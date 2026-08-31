import { NextResponse } from "next/server";
import { requireDealerSession } from "@/lib/auth-guards";
import { confirmImport } from "@/services/inventory/import";

export async function POST(req: Request) {
  const authResult = await requireDealerSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const body = await req.json();
  const { importId, rowIndices, markMissingAsSold } = body;

  if (!importId) {
    return NextResponse.json({ error: "importId required" }, { status: 400 });
  }

  try {
    const result = await confirmImport({
      dealerId: authResult.session.user.dealerId!,
      importId,
      rowIndices,
      markMissingAsSold: Boolean(markMissingAsSold),
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "IMPORT_FAILED";
    const status = msg === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

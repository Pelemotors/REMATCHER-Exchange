import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { buildImportPreview } from "@/services/inventory/import";

export async function POST(req: Request) {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
    return NextResponse.json(
      { error: "Unsupported format — use CSV or XLSX" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await buildImportPreview({
      dealerId: authResult.session.user.dealerId!,
      fileName: file.name,
      buffer,
    });
    return NextResponse.json(preview);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "IMPORT_FAILED";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

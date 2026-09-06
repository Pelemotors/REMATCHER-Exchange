import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth-guards";
import { buildImportPreview } from "@/services/inventory/import";

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
      dealerId,
      fileName: file.name,
      buffer,
    });
    return NextResponse.json(preview);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "IMPORT_FAILED";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

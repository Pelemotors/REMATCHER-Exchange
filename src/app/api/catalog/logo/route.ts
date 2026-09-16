import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { saveCatalogLogo } from "@/services/catalog/catalog-service";
import { isAllowedImageMime } from "@/lib/media/storage";

export async function POST(req: Request) {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const dealerId = auth.session.user.dealerId!;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (!isAllowedImageMime(file.type || "image/jpeg")) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await saveCatalogLogo({ dealerId, bytes });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}

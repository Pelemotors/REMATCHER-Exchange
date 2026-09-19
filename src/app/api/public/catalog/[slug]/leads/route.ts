import { NextResponse } from "next/server";
import { submitCatalogLead } from "@/services/catalog/leads";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const result = await submitCatalogLead({
    slug,
    name: typeof body.name === "string" ? body.name : "",
    phone: typeof body.phone === "string" ? body.phone : "",
    message: typeof body.message === "string" ? body.message : null,
    publicId: typeof body.publicId === "string" ? body.publicId : null,
    clientSubmissionId:
      typeof body.clientSubmissionId === "string" ? body.clientSubmissionId : "",
    honeypot: typeof body.company === "string" ? body.company : "",
    consentVersion:
      typeof body.consentVersion === "string" ? body.consentVersion : null,
  });
  if (!result.ok) {
    const status =
      result.error === "rate_limited"
        ? 429
        : result.error === "catalog_not_found" ||
            result.error === "publication_not_found"
          ? 404
          : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}

import { createHmac, timingSafeEqual } from "node:crypto";

const PURPOSE = "CATALOG_PREVIEW" as const;
const DEFAULT_TTL_SEC = 30 * 60;

type PreviewPayload = {
  catalogId: string;
  dealerId: string;
  purpose: typeof PURPOSE;
  exp: number;
};

function previewSecret(): string | null {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.CATALOG_PREVIEW_SECRET ||
    null
  );
}

function signRaw(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function issueCatalogPreviewToken(params: {
  catalogId: string;
  dealerId: string;
  ttlSec?: number;
}): { token: string; exp: number } | { error: "preview_secret_missing" } {
  const secret = previewSecret();
  if (!secret) return { error: "preview_secret_missing" };
  const exp = Math.floor(Date.now() / 1000) + (params.ttlSec ?? DEFAULT_TTL_SEC);
  const payload: PreviewPayload = {
    catalogId: params.catalogId,
    dealerId: params.dealerId,
    purpose: PURPOSE,
    exp,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const token = `${body}.${signRaw(body, secret)}`;
  return { token, exp };
}

export function verifyCatalogPreviewToken(
  token: string | null | undefined,
  expected: { catalogId: string; dealerId?: string }
): boolean {
  if (!token) return false;
  const secret = previewSecret();
  if (!secret) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expectedSig = signRaw(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as PreviewPayload;
    if (payload.purpose !== PURPOSE) return false;
    if (payload.catalogId !== expected.catalogId) return false;
    if (expected.dealerId && payload.dealerId !== expected.dealerId) return false;
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type VerifiedAppleIdentity = {
  provider: "APPLE";
  subject: string;
  email: string | null;
  emailVerified: boolean;
  raw: Record<string, unknown>;
};

const APPLE_ISS = "https://appleid.apple.com";
const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys")
);

function appleAudiences(): string[] {
  const ids = [
    process.env.APPLE_CLIENT_ID,
    process.env.APPLE_BUNDLE_ID,
    process.env.APPLE_IOS_CLIENT_ID,
    "co.rematcher.exchange",
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
  return [...new Set(ids)];
}

function hasAppleCredentials(): boolean {
  return appleAudiences().length > 0;
}

function isFakeMode(): boolean {
  return process.env.IDENTITY_PROVIDER_MODE === "fake";
}

/**
 * Fake token formats (tests only):
 * - `fake.apple.<base64url(json)>`
 * - raw JSON string starting with `{"sub":`
 */
export function parseFakeAppleToken(idToken: string): VerifiedAppleIdentity {
  let payload: Record<string, unknown>;
  if (idToken.startsWith("fake.apple.")) {
    const b64 = idToken.slice("fake.apple.".length);
    payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } else if (idToken.trim().startsWith("{")) {
    payload = JSON.parse(idToken);
  } else {
    throw new Error("Invalid fake Apple token");
  }
  const sub = String(payload.sub ?? "");
  if (!sub) throw new Error("Fake Apple token missing sub");
  return {
    provider: "APPLE",
    subject: sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    emailVerified: payload.email_verified !== false,
    raw: payload,
  };
}

export async function verifyAppleIdToken(
  idToken: string,
  opts?: { nonce?: string }
): Promise<VerifiedAppleIdentity> {
  if (isFakeMode() && !hasAppleCredentials()) {
    return parseFakeAppleToken(idToken);
  }

  if (isFakeMode() && idToken.startsWith("fake.apple.")) {
    return parseFakeAppleToken(idToken);
  }

  const aud = appleAudiences();
  if (aud.length === 0) {
    if (isFakeMode()) return parseFakeAppleToken(idToken);
    throw new Error("APPLE_CLIENT_ID not configured");
  }

  const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
    issuer: APPLE_ISS,
    audience: aud,
  });

  if (opts?.nonce && payload.nonce && payload.nonce !== opts.nonce) {
    throw new Error("Apple nonce mismatch");
  }

  const sub = payload.sub;
  if (!sub) throw new Error("Apple token missing sub");

  return {
    provider: "APPLE",
    subject: sub,
    email:
      typeof payload.email === "string"
        ? payload.email.toLowerCase()
        : null,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    raw: payload as Record<string, unknown>,
  };
}

export function encodeFakeAppleToken(claims: {
  sub: string;
  email?: string;
  email_verified?: boolean;
}): string {
  const json = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `fake.apple.${json}`;
}

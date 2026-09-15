import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type VerifiedGoogleIdentity = {
  provider: "GOOGLE";
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  raw: Record<string, unknown>;
};

const GOOGLE_ISS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

function googleAudiences(): string[] {
  const ids = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_WEB_CLIENT_ID,
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
  return [...new Set(ids)];
}

function hasGoogleCredentials(): boolean {
  return googleAudiences().length > 0;
}

function isFakeMode(): boolean {
  return process.env.IDENTITY_PROVIDER_MODE === "fake";
}

export function parseFakeGoogleToken(idToken: string): VerifiedGoogleIdentity {
  let payload: Record<string, unknown>;
  if (idToken.startsWith("fake.google.")) {
    const b64 = idToken.slice("fake.google.".length);
    payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } else if (idToken.trim().startsWith("{")) {
    payload = JSON.parse(idToken);
  } else {
    throw new Error("Invalid fake Google token");
  }
  const sub = String(payload.sub ?? "");
  if (!sub) throw new Error("Fake Google token missing sub");
  return {
    provider: "GOOGLE",
    subject: sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    emailVerified: payload.email_verified !== false,
    name: typeof payload.name === "string" ? payload.name : null,
    raw: payload,
  };
}

export async function verifyGoogleIdToken(
  idToken: string
): Promise<VerifiedGoogleIdentity> {
  if (isFakeMode() && !hasGoogleCredentials()) {
    return parseFakeGoogleToken(idToken);
  }

  if (isFakeMode() && idToken.startsWith("fake.google.")) {
    return parseFakeGoogleToken(idToken);
  }

  const audiences = googleAudiences();
  if (audiences.length === 0) {
    if (isFakeMode()) return parseFakeGoogleToken(idToken);
    throw new Error("GOOGLE_CLIENT_ID not configured");
  }

  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: GOOGLE_ISS,
    audience: audiences,
  });

  const sub = payload.sub;
  if (!sub) throw new Error("Google token missing sub");

  return {
    provider: "GOOGLE",
    subject: sub,
    email:
      typeof payload.email === "string"
        ? payload.email.toLowerCase()
        : null,
    emailVerified:
      payload.email_verified === true || payload.email_verified === "true",
    name: typeof payload.name === "string" ? payload.name : null,
    raw: payload as Record<string, unknown>,
  };
}

export function encodeFakeGoogleToken(claims: {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}): string {
  const json = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `fake.google.${json}`;
}

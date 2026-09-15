import "server-only";
import { createRemoteJWKSet, decodeProtectedHeader, importPKCS8, SignJWT, jwtVerify } from "jose";
import type { NormalizedSubscription, PurchaseProof } from "./types";
import { isBillingFakeMode } from "./types";

/**
 * Fake proof JSON (tests only, BILLING_PROVIDER_MODE=fake):
 * `{ "subscriptionId":"sub_1","productId":"plan_monthly","transactionId":"tx_1",
 *    "status":"ACTIVE","periodEnd":"...","graceEnd":null,"eventType":"INITIAL_BUY" }`
 */
export function parseFakeAppleProof(proof: string): NormalizedSubscription {
  const raw = JSON.parse(proof) as Record<string, unknown>;
  const now = new Date();
  const periodEnd = raw.periodEnd
    ? new Date(String(raw.periodEnd))
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const graceEnd = raw.graceEnd ? new Date(String(raw.graceEnd)) : null;
  return {
    provider: "APPLE",
    externalSubscriptionId: String(raw.subscriptionId ?? raw.originalTransactionId ?? "apple-sub"),
    externalProductId: String(raw.productId ?? "com.rematcher.exchange.monthly"),
    externalTransactionId: String(raw.transactionId ?? `apple-tx-${Date.now()}`),
    status: (raw.status as NormalizedSubscription["status"]) ?? "ACTIVE",
    autoRenew: raw.autoRenew !== false,
    purchasedAt: raw.purchasedAt ? new Date(String(raw.purchasedAt)) : now,
    currentPeriodStart: raw.periodStart ? new Date(String(raw.periodStart)) : now,
    currentPeriodEnd: periodEnd,
    gracePeriodEndsAt: graceEnd,
    environment: raw.environment === "PRODUCTION" ? "PRODUCTION" : "SANDBOX",
    eventType: String(raw.eventType ?? "INITIAL_BUY"),
    raw,
  };
}

function appleConfigured(): boolean {
  return Boolean(
    process.env.APPLE_IAP_ISSUER_ID &&
      process.env.APPLE_IAP_KEY_ID &&
      process.env.APPLE_IAP_PRIVATE_KEY &&
      process.env.APPLE_IAP_BUNDLE_ID
  );
}

function normalizePem(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function msToDate(v: unknown): Date | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return new Date(n);
}

function mapAppleNotificationToStatus(
  notificationType: string,
  subtype?: string | null
): NormalizedSubscription["status"] {
  const t = notificationType.toUpperCase();
  const s = (subtype ?? "").toUpperCase();
  if (t === "REFUND") return "REFUNDED";
  if (t === "REVOKE") return "REVOKED";
  if (t === "EXPIRED") return "EXPIRED";
  if (t === "DID_FAIL_TO_RENEW" || s === "GRACE_PERIOD") return "IN_GRACE_PERIOD";
  if (t === "DID_CHANGE_RENEWAL_STATUS" && s === "AUTO_RENEW_DISABLED") {
    return "CANCELLED";
  }
  if (
    t === "DID_RENEW" ||
    t === "SUBSCRIBED" ||
    t === "OFFER_REDEEMED" ||
    t === "INITIAL_BUY"
  ) {
    return "ACTIVE";
  }
  return "ACTIVE";
}

function transactionPayloadToNormalized(
  payload: Record<string, unknown>,
  eventType: string,
  statusOverride?: NormalizedSubscription["status"]
): NormalizedSubscription {
  const expiresDate = msToDate(payload.expiresDate);
  const purchaseDate = msToDate(payload.purchaseDate);
  const revocationDate = msToDate(payload.revocationDate);
  let status: NormalizedSubscription["status"] = statusOverride ?? "ACTIVE";
  if (revocationDate) status = "REVOKED";
  else if (expiresDate && expiresDate.getTime() < Date.now()) status = "EXPIRED";

  return {
    provider: "APPLE",
    externalSubscriptionId: String(payload.originalTransactionId ?? payload.transactionId),
    externalProductId: String(payload.productId ?? ""),
    externalTransactionId: String(payload.transactionId ?? payload.originalTransactionId),
    status,
    autoRenew: payload.autoRenewStatus !== 0 && payload.autoRenewStatus !== "0",
    purchasedAt: purchaseDate,
    currentPeriodStart: purchaseDate,
    currentPeriodEnd: expiresDate,
    gracePeriodEndsAt: msToDate(payload.gracePeriodExpiresDate),
    environment:
      String(payload.environment ?? "").toUpperCase() === "PRODUCTION"
        ? "PRODUCTION"
        : "SANDBOX",
    eventType,
    raw: payload,
  };
}

async function decodeAppleJwsPayload(jws: string): Promise<Record<string, unknown>> {
  // Prefer signature verification via x5c in JWS header (Apple App Store Server style).
  const header = decodeProtectedHeader(jws);
  const x5c = header.x5c;
  if (Array.isArray(x5c) && typeof x5c[0] === "string") {
    const pem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`;
    const { importX509 } = await import("jose");
    const key = await importX509(pem, header.alg ?? "ES256");
    const { payload } = await jwtVerify(jws, key, { algorithms: ["ES256"] });
    return payload as Record<string, unknown>;
  }
  // Fallback: Apple root JWKS (ASN signedPayload may still carry x5c).
  const jwks = createRemoteJWKSet(
    new URL("https://appleid.apple.com/auth/keys")
  );
  try {
    const { payload } = await jwtVerify(jws, jwks, { algorithms: ["ES256"] });
    return payload as Record<string, unknown>;
  } catch {
    // Last resort decode without verify only when OWNER explicitly allows insecure decode (never default).
    throw new Error("Apple JWS signature verification failed");
  }
}

async function createAppStoreApiToken(): Promise<string> {
  const issuerId = process.env.APPLE_IAP_ISSUER_ID!;
  const keyId = process.env.APPLE_IAP_KEY_ID!;
  const bundleId = process.env.APPLE_IAP_BUNDLE_ID!;
  const privateKey = await importPKCS8(
    normalizePem(process.env.APPLE_IAP_PRIVATE_KEY!),
    "ES256"
  );
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ bid: bundleId })
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setIssuedAt(now)
    .setExpirationTime(now + 50 * 60)
    .setAudience("appstoreconnect-v1")
    .sign(privateKey);
}

async function fetchAppleTransaction(
  transactionId: string,
  environment: "PRODUCTION" | "SANDBOX"
): Promise<NormalizedSubscription> {
  const host =
    environment === "PRODUCTION"
      ? "https://api.storekit.itunes.apple.com"
      : "https://api.storekit-sandbox.itunes.apple.com";
  const token = await createAppStoreApiToken();
  const res = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Apple App Store Server API ${res.status} (${environment}): ${text.slice(0, 200)}`
    );
  }
  const body = (await res.json()) as { signedTransactionInfo?: string };
  if (!body.signedTransactionInfo) {
    throw new Error("Apple transaction response missing signedTransactionInfo");
  }
  const payload = await decodeAppleJwsPayload(body.signedTransactionInfo);
  return transactionPayloadToNormalized(payload, "VERIFY", "ACTIVE");
}

/**
 * App Store Server API transaction lookup.
 * Requires APPLE_IAP_ISSUER_ID / KEY_ID / PRIVATE_KEY / BUNDLE_ID (OWNER_BLOCKED until set).
 */
async function verifyAppleTransactionId(
  transactionId: string,
  preferredEnv?: "PRODUCTION" | "SANDBOX"
): Promise<NormalizedSubscription> {
  if (!appleConfigured()) {
    throw new Error(
      "Apple subscription verification not configured (OWNER_BLOCKED: APPLE_IAP_ISSUER_ID/KEY_ID/PRIVATE_KEY/BUNDLE_ID)"
    );
  }
  const order: Array<"PRODUCTION" | "SANDBOX"> =
    preferredEnv === "SANDBOX"
      ? ["SANDBOX", "PRODUCTION"]
      : ["PRODUCTION", "SANDBOX"];
  let lastErr: unknown;
  for (const env of order) {
    try {
      return await fetchAppleTransaction(transactionId, env);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Apple transaction verification failed");
}

export async function verifyApplePurchase(
  proof: PurchaseProof
): Promise<NormalizedSubscription> {
  if (isBillingFakeMode()) {
    return parseFakeAppleProof(proof.proof);
  }
  const trimmed = proof.proof.trim();
  if (trimmed.startsWith("{")) {
    throw new Error("JSON proofs are only accepted in BILLING_PROVIDER_MODE=fake");
  }
  // JWS transaction (StoreKit 2) — verify locally
  if (trimmed.split(".").length === 3) {
    const payload = await decodeAppleJwsPayload(trimmed);
    return transactionPayloadToNormalized(payload, "CLIENT_JWS", "ACTIVE");
  }
  const env =
    proof.environment === "PRODUCTION"
      ? "PRODUCTION"
      : proof.environment === "SANDBOX"
        ? "SANDBOX"
        : undefined;
  return verifyAppleTransactionId(trimmed, env);
}

export async function verifyAppleWebhookPayload(
  body: string,
  _signature?: string | null
): Promise<NormalizedSubscription> {
  if (isBillingFakeMode()) {
    return parseFakeAppleProof(body);
  }
  if (!appleConfigured() && !process.env.APPLE_IAP_SHARED_SECRET) {
    throw new Error(
      "Apple webhook verification not configured (OWNER_BLOCKED: APPLE_IAP_* or APPLE_IAP_SHARED_SECRET)"
    );
  }
  const parsed = JSON.parse(body) as Record<string, unknown>;
  if (typeof parsed.signedPayload !== "string") {
    throw new Error("Apple ASN v2 payload missing signedPayload");
  }
  const notification = await decodeAppleJwsPayload(parsed.signedPayload);
  const notificationType = String(notification.notificationType ?? "UNKNOWN");
  const subtype =
    notification.subtype != null ? String(notification.subtype) : null;
  const data = (notification.data ?? {}) as Record<string, unknown>;
  const signedTx =
    typeof data.signedTransactionInfo === "string"
      ? data.signedTransactionInfo
      : null;
  if (!signedTx) {
    throw new Error("Apple notification missing signedTransactionInfo");
  }
  const txPayload = await decodeAppleJwsPayload(signedTx);
  const status = mapAppleNotificationToStatus(notificationType, subtype);
  return transactionPayloadToNormalized(txPayload, notificationType, status);
}

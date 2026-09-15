import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { importPKCS8, SignJWT } from "jose";
import type { NormalizedSubscription, PurchaseProof } from "./types";
import { isBillingFakeMode } from "./types";

export function parseFakeGoogleProof(proof: string): NormalizedSubscription {
  const raw = JSON.parse(proof) as Record<string, unknown>;
  const now = new Date();
  const periodEnd = raw.periodEnd
    ? new Date(String(raw.periodEnd))
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const graceEnd = raw.graceEnd ? new Date(String(raw.graceEnd)) : null;
  return {
    provider: "GOOGLE",
    externalSubscriptionId: String(
      raw.subscriptionId ?? raw.purchaseToken ?? "google-sub"
    ),
    externalProductId: String(raw.productId ?? "monthly_subscription"),
    externalTransactionId: String(
      raw.transactionId ?? raw.orderId ?? `google-tx-${Date.now()}`
    ),
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

function googlePlayConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON &&
      process.env.GOOGLE_PLAY_PACKAGE_NAME
  );
}

type GoogleProofParts = {
  purchaseToken: string;
  productId: string;
  packageName: string;
};

function parseGoogleProofParts(proof: string, productIdHint?: string): GoogleProofParts {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME!;
  const trimmed = proof.trim();
  if (trimmed.startsWith("{")) {
    const raw = JSON.parse(trimmed) as Record<string, unknown>;
    const purchaseToken = String(raw.purchaseToken ?? raw.token ?? "");
    const productId = String(raw.productId ?? productIdHint ?? "");
    if (!purchaseToken || !productId) {
      throw new Error("Google proof JSON requires purchaseToken and productId");
    }
    return {
      purchaseToken,
      productId,
      packageName: String(raw.packageName ?? packageName),
    };
  }
  // opaque: "productId:purchaseToken" or bare token with productId hint
  if (trimmed.includes(":")) {
    const idx = trimmed.indexOf(":");
    return {
      productId: trimmed.slice(0, idx),
      purchaseToken: trimmed.slice(idx + 1),
      packageName,
    };
  }
  if (!productIdHint) {
    throw new Error("Google purchase proof requires productId");
  }
  return { purchaseToken: trimmed, productId: productIdHint, packageName };
}

function mapGooglePaymentState(sub: Record<string, unknown>): NormalizedSubscription["status"] {
  // paymentState: 0 pending, 1 received, 2 free trial, 3 deferred
  // cancelReason / expiryTimeMillis determine expired
  const expiry = sub.expiryTimeMillis != null ? Number(sub.expiryTimeMillis) : null;
  if (expiry != null && expiry < Date.now()) return "EXPIRED";
  if (sub.userCancellationTimeMillis) return "CANCELLED";
  const paymentState = Number(sub.paymentState ?? 1);
  if (paymentState === 0) return "PENDING";
  // Grace: subscription is in account hold / grace — paymentState may still be 0 with expiry in future
  if (sub.paymentState === 0 && expiry != null && expiry > Date.now()) {
    return "IN_GRACE_PERIOD";
  }
  return "ACTIVE";
}

async function googleAccessToken(): Promise<string> {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON!;
  const sa = JSON.parse(raw) as {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };
  if (!sa.client_email || !sa.private_key) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing client_email/private_key");
  }
  const key = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/androidpublisher",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri ?? "https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const tokenRes = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    throw new Error(`Google SA token exchange failed: ${tokenRes.status} ${text.slice(0, 200)}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error("Google SA token response missing access_token");
  }
  return tokenJson.access_token;
}

async function fetchGoogleSubscription(
  parts: GoogleProofParts
): Promise<NormalizedSubscription> {
  const accessToken = await googleAccessToken();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(parts.packageName)}/purchases/subscriptions/` +
    `${encodeURIComponent(parts.productId)}/tokens/${encodeURIComponent(parts.purchaseToken)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Play Developer API ${res.status}: ${text.slice(0, 200)}`);
  }
  const sub = (await res.json()) as Record<string, unknown>;
  const status = mapGooglePaymentState(sub);
  const startMs = sub.startTimeMillis != null ? Number(sub.startTimeMillis) : Date.now();
  const endMs =
    sub.expiryTimeMillis != null
      ? Number(sub.expiryTimeMillis)
      : Date.now() + 30 * 24 * 60 * 60 * 1000;
  // Acknowledge if required (acknowledgementState === 0)
  if (Number(sub.acknowledgementState) === 0) {
    const ackUrl = `${url}:acknowledge`;
    await fetch(ackUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch(() => {
      /* non-fatal — entitlement still based on verified purchase */
    });
  }
  return {
    provider: "GOOGLE",
    externalSubscriptionId: parts.purchaseToken,
    externalProductId: parts.productId,
    externalTransactionId: String(sub.orderId ?? parts.purchaseToken),
    status,
    autoRenew: Number(sub.autoRenewing) === 1 || sub.autoRenewing === true,
    purchasedAt: new Date(startMs),
    currentPeriodStart: new Date(startMs),
    currentPeriodEnd: new Date(endMs),
    gracePeriodEndsAt: null,
    environment: "PRODUCTION",
    eventType: "VERIFY",
    raw: sub,
  };
}

export async function verifyGooglePlayPurchase(
  proof: PurchaseProof
): Promise<NormalizedSubscription> {
  if (isBillingFakeMode()) {
    return parseFakeGoogleProof(proof.proof);
  }
  if (!googlePlayConfigured()) {
    throw new Error(
      "Google Play subscription verification not configured (OWNER_BLOCKED: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON / GOOGLE_PLAY_PACKAGE_NAME)"
    );
  }
  const trimmed = proof.proof.trim();
  // In non-fake mode, bare status JSON without purchaseToken is rejected.
  if (trimmed.startsWith("{")) {
    const raw = JSON.parse(trimmed) as Record<string, unknown>;
    if (!raw.purchaseToken && !raw.token) {
      throw new Error("JSON proofs are only accepted in BILLING_PROVIDER_MODE=fake");
    }
  }
  const parts = parseGoogleProofParts(trimmed, proof.productId);
  return fetchGoogleSubscription(parts);
}

export async function verifyGoogleWebhookPayload(
  body: string,
  signature?: string | null
): Promise<NormalizedSubscription> {
  if (isBillingFakeMode()) {
    return parseFakeGoogleProof(body);
  }
  const secret = process.env.GOOGLE_PLAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Google webhook signature verification not configured (OWNER_BLOCKED)");
  }
  if (!signature) {
    throw new Error("Missing Google webhook signature");
  }
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const given = signature.replace(/^sha256=/i, "");
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid Google webhook signature");
  }

  // Real-mode Pub/Sub RTDN: { message: { data: base64 } } → DeveloperNotification
  const envelope = JSON.parse(body) as Record<string, unknown>;
  let notification: Record<string, unknown> = envelope;
  if (envelope.message && typeof envelope.message === "object") {
    const msg = envelope.message as { data?: string };
    if (typeof msg.data === "string") {
      notification = JSON.parse(
        Buffer.from(msg.data, "base64").toString("utf8")
      ) as Record<string, unknown>;
    }
  }

  const subNotif = notification.subscriptionNotification as
    | Record<string, unknown>
    | undefined;
  if (!subNotif) {
    throw new Error("Google RTDN missing subscriptionNotification");
  }
  if (!googlePlayConfigured()) {
    throw new Error(
      "Google Play API not configured to resolve RTDN purchaseToken (OWNER_BLOCKED)"
    );
  }
  const purchaseToken = String(subNotif.purchaseToken ?? "");
  const productId = String(subNotif.subscriptionId ?? "");
  if (!purchaseToken || !productId) {
    throw new Error("Google RTDN missing purchaseToken/subscriptionId");
  }
  const normalized = await fetchGoogleSubscription({
    purchaseToken,
    productId,
    packageName: String(
      notification.packageName ?? process.env.GOOGLE_PLAY_PACKAGE_NAME!
    ),
  });
  const ntype = Number(subNotif.notificationType ?? 0);
  // 2=renewed 3=canceled 12=revoked 13=expired …
  if (ntype === 13) normalized.status = "EXPIRED";
  if (ntype === 12) normalized.status = "REVOKED";
  if (ntype === 3) normalized.status = "CANCELLED";
  if (ntype === 6 || ntype === 5) normalized.status = "IN_GRACE_PERIOD";
  normalized.eventType = `RTDN_${ntype}`;
  normalized.raw = { ...normalized.raw, rtdn: notification };
  return normalized;
}

/**
 * In-memory rate limiter with separate buckets.
 * Production note: resets on cold start; sufficient for MVP pilot.
 */

type Entry = { count: number; resetAt: number };

const stores = new Map<string, Map<string, Entry>>();

const WINDOWS = {
  loginFail: 15 * 60 * 1000,
  signup: 60 * 60 * 1000,
  forgotPassword: 60 * 60 * 1000,
  resendVerification: 60 * 60 * 1000,
  resetPassword: 60 * 60 * 1000,
} as const;

const LIMITS = {
  loginFailEmail: 8,
  loginFailIp: 25,
  signup: 5,
  forgotPassword: 5,
  resendVerification: 5,
  resetPassword: 8,
} as const;

type Bucket = keyof typeof WINDOWS;

function getStore(bucket: Bucket): Map<string, Entry> {
  if (!stores.has(bucket)) stores.set(bucket, new Map());
  return stores.get(bucket)!;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function increment(bucket: Bucket, id: string): Entry {
  const store = getStore(bucket);
  const now = Date.now();
  const windowMs = WINDOWS[bucket];
  const existing = store.get(id);

  if (!existing || now > existing.resetAt) {
    const entry = { count: 1, resetAt: now + windowMs };
    store.set(id, entry);
    return entry;
  }

  existing.count += 1;
  return existing;
}

function isOverLimit(entry: Entry | undefined, limit: number): boolean {
  if (!entry) return false;
  if (Date.now() > entry.resetAt) return false;
  return entry.count >= limit;
}

function clear(bucket: Bucket, id: string) {
  getStore(bucket).delete(id);
}

export function recordFailedLogin(email: string, ip?: string) {
  const normalized = normalizeEmail(email);
  increment("loginFail", `email:${normalized}`);
  if (ip) increment("loginFail", `ip:${ip}`);
}

export function clearLoginFailures(email: string, ip?: string) {
  const normalized = normalizeEmail(email);
  clear("loginFail", `email:${normalized}`);
  if (ip) clear("loginFail", `ip:${ip}`);
}

export function isLoginBlocked(email: string, ip?: string): boolean {
  const normalized = normalizeEmail(email);
  const store = getStore("loginFail");
  return (
    isOverLimit(store.get(`email:${normalized}`), LIMITS.loginFailEmail) ||
    (ip ? isOverLimit(store.get(`ip:${ip}`), LIMITS.loginFailIp) : false)
  );
}

export function checkAndRecord(
  bucket: Bucket,
  id: string,
  limit: number
): { blocked: boolean; retryAfterMs?: number } {
  const store = getStore(bucket);
  const entry = store.get(id);
  const now = Date.now();

  if (entry && now <= entry.resetAt && entry.count >= limit) {
    return { blocked: true, retryAfterMs: entry.resetAt - now };
  }

  const updated = increment(bucket, id);
  if (updated.count > limit) {
    return { blocked: true, retryAfterMs: updated.resetAt - now };
  }

  return { blocked: false };
}

export function checkSignup(email: string, ip?: string) {
  const normalized = normalizeEmail(email);
  const emailCheck = checkAndRecord(
    "signup",
    `email:${normalized}`,
    LIMITS.signup
  );
  if (emailCheck.blocked) return emailCheck;
  if (ip) return checkAndRecord("signup", `ip:${ip}`, LIMITS.signup);
  return { blocked: false };
}

export function checkForgotPassword(email: string, ip?: string) {
  const normalized = normalizeEmail(email);
  const emailCheck = checkAndRecord(
    "forgotPassword",
    `email:${normalized}`,
    LIMITS.forgotPassword
  );
  if (emailCheck.blocked) return emailCheck;
  if (ip) return checkAndRecord("forgotPassword", `ip:${ip}`, LIMITS.forgotPassword);
  return { blocked: false };
}

export function checkResendVerification(email: string, ip?: string) {
  const normalized = normalizeEmail(email);
  const emailCheck = checkAndRecord(
    "resendVerification",
    `email:${normalized}`,
    LIMITS.resendVerification
  );
  if (emailCheck.blocked) return emailCheck;
  if (ip) {
    return checkAndRecord("resendVerification", `ip:${ip}`, LIMITS.resendVerification);
  }
  return { blocked: false };
}

export function clearAllLoginBlocksForEmail(email: string) {
  const normalized = normalizeEmail(email);
  const store = getStore("loginFail");
  for (const key of [...store.keys()]) {
    if (key.includes(normalized)) store.delete(key);
  }
}

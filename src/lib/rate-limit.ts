/**
 * Shared rate limiter — Postgres in production, in-memory in tests.
 * Atomic increment with window expiry per bucket+key.
 */

import { prisma } from "@/lib/prisma";

type Entry = { count: number; resetAt: number };

const memoryStores = new Map<string, Map<string, Entry>>();

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

function useMemoryStore(): boolean {
  return (
    process.env.RATE_LIMIT_BACKEND === "memory" ||
    process.env.VITEST === "true" ||
    process.env.NODE_ENV === "test"
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getMemoryStore(bucket: Bucket): Map<string, Entry> {
  if (!memoryStores.has(bucket)) memoryStores.set(bucket, new Map());
  return memoryStores.get(bucket)!;
}

function memoryIncrement(
  bucket: Bucket,
  key: string
): { count: number; resetAt: number } {
  const store = getMemoryStore(bucket);
  const now = Date.now();
  const windowMs = WINDOWS[bucket];
  const existing = store.get(key);

  if (!existing || now > existing.resetAt) {
    const entry = { count: 1, resetAt: now + windowMs };
    store.set(key, entry);
    return entry;
  }

  existing.count += 1;
  return existing;
}

function memoryClear(bucket: Bucket, key: string) {
  getMemoryStore(bucket).delete(key);
}

async function postgresIncrement(
  bucket: Bucket,
  key: string
): Promise<{ count: number; resetAt: number }> {
  const windowMs = WINDOWS[bucket];
  const resetAt = new Date(Date.now() + windowMs);

  const rows = await prisma.$queryRaw<
    Array<{ count: number; resetAt: Date }>
  >`
    INSERT INTO "RateLimitEntry" (bucket, key, count, "resetAt", "updatedAt")
    VALUES (${bucket}, ${key}, 1, ${resetAt}, NOW())
    ON CONFLICT (bucket, key) DO UPDATE SET
      count = CASE
        WHEN "RateLimitEntry"."resetAt" < NOW() THEN 1
        ELSE "RateLimitEntry".count + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitEntry"."resetAt" < NOW() THEN ${resetAt}
        ELSE "RateLimitEntry"."resetAt"
      END,
      "updatedAt" = NOW()
    RETURNING count, "resetAt"
  `;

  const row = rows[0];
  return { count: row.count, resetAt: row.resetAt.getTime() };
}

async function postgresClear(bucket: Bucket, key: string) {
  await prisma.rateLimitEntry.deleteMany({
    where: { bucket, key },
  });
}

async function increment(
  bucket: Bucket,
  key: string
): Promise<{ count: number; resetAt: number }> {
  if (useMemoryStore()) {
    return memoryIncrement(bucket, key);
  }
  return postgresIncrement(bucket, key);
}

async function clear(bucket: Bucket, key: string) {
  if (useMemoryStore()) {
    memoryClear(bucket, key);
    return;
  }
  await postgresClear(bucket, key);
}

function isOverLimit(
  entry: { count: number; resetAt: number } | undefined,
  limit: number
): boolean {
  if (!entry) return false;
  if (Date.now() > entry.resetAt) return false;
  return entry.count >= limit;
}

export async function recordFailedLogin(email: string, ip?: string) {
  const normalized = normalizeEmail(email);
  await increment("loginFail", `email:${normalized}`);
  if (ip) await increment("loginFail", `ip:${ip}`);
}

export async function clearLoginFailures(email: string, ip?: string) {
  const normalized = normalizeEmail(email);
  await clear("loginFail", `email:${normalized}`);
  if (ip) await clear("loginFail", `ip:${ip}`);
}

export async function isLoginBlocked(
  email: string,
  ip?: string
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (useMemoryStore()) {
    const store = getMemoryStore("loginFail");
    return (
      isOverLimit(store.get(`email:${normalized}`), LIMITS.loginFailEmail) ||
      (ip ? isOverLimit(store.get(`ip:${ip}`), LIMITS.loginFailIp) : false)
    );
  }

  const keys = [`email:${normalized}`, ...(ip ? [`ip:${ip}`] : [])];
  const entries = await prisma.rateLimitEntry.findMany({
    where: { bucket: "loginFail", key: { in: keys } },
  });

  const byKey = new Map(entries.map((e) => [e.key, e]));
  const emailEntry = byKey.get(`email:${normalized}`);
  const ipEntry = ip ? byKey.get(`ip:${ip}`) : undefined;

  return (
    isOverLimit(
      emailEntry
        ? { count: emailEntry.count, resetAt: emailEntry.resetAt.getTime() }
        : undefined,
      LIMITS.loginFailEmail
    ) ||
    (ip
      ? isOverLimit(
          ipEntry
            ? { count: ipEntry.count, resetAt: ipEntry.resetAt.getTime() }
            : undefined,
          LIMITS.loginFailIp
        )
      : false)
  );
}

export async function checkAndRecord(
  bucket: Bucket,
  id: string,
  limit: number
): Promise<{ blocked: boolean; retryAfterMs?: number }> {
  if (useMemoryStore()) {
    const store = getMemoryStore(bucket);
    const entry = store.get(id);
    const now = Date.now();

    if (entry && now <= entry.resetAt && entry.count >= limit) {
      return { blocked: true, retryAfterMs: entry.resetAt - now };
    }

    const updated = memoryIncrement(bucket, id);
    if (updated.count > limit) {
      return { blocked: true, retryAfterMs: updated.resetAt - now };
    }
    return { blocked: false };
  }

  const updated = await postgresIncrement(bucket, id);
  const now = Date.now();
  if (updated.count > limit) {
    return { blocked: true, retryAfterMs: updated.resetAt - now };
  }
  return { blocked: false };
}

export async function checkSignup(email: string, ip?: string) {
  const normalized = normalizeEmail(email);
  const emailCheck = await checkAndRecord(
    "signup",
    `email:${normalized}`,
    LIMITS.signup
  );
  if (emailCheck.blocked) return emailCheck;
  if (ip) return checkAndRecord("signup", `ip:${ip}`, LIMITS.signup);
  return { blocked: false };
}

export async function checkForgotPassword(email: string, ip?: string) {
  const normalized = normalizeEmail(email);
  const emailCheck = await checkAndRecord(
    "forgotPassword",
    `email:${normalized}`,
    LIMITS.forgotPassword
  );
  if (emailCheck.blocked) return emailCheck;
  if (ip) {
    return checkAndRecord("forgotPassword", `ip:${ip}`, LIMITS.forgotPassword);
  }
  return { blocked: false };
}

export async function checkResendVerification(email: string, ip?: string) {
  const normalized = normalizeEmail(email);
  const emailCheck = await checkAndRecord(
    "resendVerification",
    `email:${normalized}`,
    LIMITS.resendVerification
  );
  if (emailCheck.blocked) return emailCheck;
  if (ip) {
    return checkAndRecord(
      "resendVerification",
      `ip:${ip}`,
      LIMITS.resendVerification
    );
  }
  return { blocked: false };
}

export async function clearAllLoginBlocksForEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (useMemoryStore()) {
    const store = getMemoryStore("loginFail");
    for (const key of [...store.keys()]) {
      if (key.includes(normalized)) store.delete(key);
    }
    return;
  }
  await prisma.rateLimitEntry.deleteMany({
    where: {
      bucket: "loginFail",
      key: { contains: normalized },
    },
  });
}

/** Best-effort cleanup of expired entries (call from cron or admin) */
export async function cleanupExpiredRateLimits() {
  if (useMemoryStore()) return;
  await prisma.rateLimitEntry.deleteMany({
    where: { resetAt: { lt: new Date() } },
  });
}

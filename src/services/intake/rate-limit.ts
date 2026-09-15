/**
 * Lightweight in-process rate limit for Intake uploads (per dealer).
 * Complements auth; does not require RateLimitEntry schema changes.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function checkIntakeRateLimit(input: {
  dealerId: string;
  kind: "create" | "upload" | "ack" | "resolve";
}): { blocked: boolean; retryAfterMs?: number } {
  const limits: Record<string, { max: number; windowMs: number }> = {
    create: { max: 30, windowMs: 60_000 },
    upload: { max: 120, windowMs: 60_000 },
    ack: { max: 60, windowMs: 60_000 },
    resolve: { max: 60, windowMs: 60_000 },
  };
  const cfg = limits[input.kind];
  const key = `${input.kind}:${input.dealerId}`;
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || now > entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + cfg.windowMs });
    return { blocked: false };
  }
  entry.count += 1;
  if (entry.count > cfg.max) {
    return { blocked: true, retryAfterMs: entry.resetAt - now };
  }
  return { blocked: false };
}

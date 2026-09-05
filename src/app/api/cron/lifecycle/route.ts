import { NextResponse } from "next/server";
import { runLifecycleCatchUp } from "@/services/ops/lifecycle-catchup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled lifecycle catch-up (Vercel Cron or manual with CRON_SECRET).
 * Safe after downtime — expires overdue demands + idempotent reminders.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const vercelCron = req.headers.get("x-vercel-cron");

  const authorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    Boolean(vercelCron) ||
    (process.env.NODE_ENV !== "production" &&
      req.headers.get("x-lifecycle-catchup") === "1");

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runLifecycleCatchUp({ source: "cron" });
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: Request) {
  return GET(req);
}

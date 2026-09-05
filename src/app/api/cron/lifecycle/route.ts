import { NextResponse } from "next/server";
import { runLifecycleCatchUp } from "@/services/ops/lifecycle-catchup";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled lifecycle catch-up (Vercel Cron / CRON_SECRET / Admin session).
 * Safe after downtime — expires overdue demands + idempotent reminders.
 */
async function authorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const vercelCron = req.headers.get("x-vercel-cron");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (vercelCron) return true;
  if (
    process.env.NODE_ENV !== "production" &&
    req.headers.get("x-lifecycle-catchup") === "1"
  ) {
    return true;
  }
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

export async function GET(req: Request) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runLifecycleCatchUp({ source: "cron" });
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: Request) {
  return GET(req);
}

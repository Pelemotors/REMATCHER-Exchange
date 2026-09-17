import { NextResponse } from "next/server";
import { runLifecycleCatchUp } from "@/services/ops/lifecycle-catchup";
import { isLifecycleCatchUpAuthorized } from "@/services/ops/cron-auth";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled lifecycle catch-up.
 * Auth: CRON_SECRET Bearer, real Vercel cron (VERCEL_ENV set),
 * non-production x-lifecycle-catchup, or admin session.
 * A bare x-vercel-cron header is not enough on the VPS.
 */
async function authorized(req: Request): Promise<boolean> {
  const session = await auth();
  return isLifecycleCatchUpAuthorized({
    authorizationHeader: req.headers.get("authorization"),
    vercelCronHeader: req.headers.get("x-vercel-cron"),
    lifecycleCatchupHeader: req.headers.get("x-lifecycle-catchup"),
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    adminSession: session?.user?.role === "ADMIN",
  });
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

import { NextResponse } from "next/server";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";
import { prisma } from "@/lib/prisma";
import { isPushConfigured } from "@/services/notifications/push";
import { getKillSwitchState } from "@/config/kill-switches";
import { MATCHING_INTELLIGENCE_LIVE_MODE } from "@/services/exchange/intelligence-live";

export const dynamic = "force-dynamic";

export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT ??
    "local";

  let db: "ok" | "error" = "error";
  let migrationsApplied: number | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
    `;
    migrationsApplied = Number(rows[0]?.count ?? 0);
  } catch {
    db = "error";
  }

  let lastLifecycleCatchup: string | null = null;
  try {
    const { getLastLifecycleCatchUp } = await import(
      "@/services/ops/lifecycle-catchup"
    );
    const last = await getLastLifecycleCatchUp();
    lastLifecycleCatchup = last.at;
  } catch {
    lastLifecycleCatchup = null;
  }

  const status = db === "ok" ? "ok" : "degraded";

  return NextResponse.json({
    status,
    commit: commit.length > 7 ? commit.slice(0, 7) : commit,
    fullCommit: commit,
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    agentVersion: AGENT_VERSION,
    build: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    matchingEngine: "2.0",
    matchingIntelligence: MATCHING_INTELLIGENCE_LIVE_MODE,
    db,
    migrationsApplied,
    pushConfigured: isPushConfigured(),
    lastLifecycleCatchup,
    killSwitches: getKillSwitchState(),
    features: {
      publicLanding: true,
      signup: true,
      forgotPassword: true,
      agentV2: true,
      sharedRateLimit: true,
    },
  });
}

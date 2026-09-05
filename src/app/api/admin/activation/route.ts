import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { getPilotActivationMetrics } from "@/services/activation/pilot-metrics";
import { getKillSwitchState } from "@/config/kill-switches";
import { getLastLifecycleCatchUp } from "@/services/ops/lifecycle-catchup";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Internal Pilot activation + ops diagnostics. Analytics only. */
export async function GET() {
  const admin = await requireAdminSession();
  if ("error" in admin) {
    return NextResponse.json(
      { error: admin.error },
      { status: admin.status }
    );
  }

  const [activation, lastCatchup, migrationCount] = await Promise.all([
    getPilotActivationMetrics(),
    getLastLifecycleCatchUp(),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
    `
      .then((r) => Number(r[0]?.count ?? 0))
      .catch(() => null),
  ]);

  return NextResponse.json({
    activation,
    ops: {
      killSwitches: getKillSwitchState(),
      lastLifecycleCatchup: lastCatchup,
      migrationsApplied: migrationCount,
      matchingEngine: "2.0",
    },
  });
}

import { NextResponse } from "next/server";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT ??
    "local";

  return NextResponse.json({
    status: "ok",
    commit: commit.length > 7 ? commit.slice(0, 7) : commit,
    fullCommit: commit,
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    agentVersion: AGENT_VERSION,
    build: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    features: {
      publicLanding: true,
      signup: true,
      forgotPassword: true,
      agentV2: true,
      sharedRateLimit: true,
    },
  });
}

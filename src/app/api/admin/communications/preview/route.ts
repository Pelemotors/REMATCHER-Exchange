import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { resolveAudience } from "@/services/admin/communications";
import type { PushAudienceType } from "@prisma/client";

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const audienceType = body.audienceType as PushAudienceType;
  const userIds = body.userIds as string[] | undefined;

  const resolution = await resolveAudience({ audienceType, userIds });
  return NextResponse.json(resolution);
}

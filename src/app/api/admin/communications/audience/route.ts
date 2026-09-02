import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { searchAudienceUsers } from "@/services/admin/communications";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const users = await searchAudienceUsers(q);
  return NextResponse.json({ users });
}

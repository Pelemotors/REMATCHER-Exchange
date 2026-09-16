import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { searchAdminEntities } from "@/services/admin/search";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchAdminEntities(q);
  return NextResponse.json({ q, results });
}

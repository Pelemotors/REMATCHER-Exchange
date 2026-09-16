import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLoginBlocked } from "@/lib/rate-limit";

/**
 * After a failed /admin login, tell the UI if this email is a dealer
 * (must never enter System Admin). Does not confirm passwords.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ code: "unknown" });
  }
  if (await isLoginBlocked(email)) {
    return NextResponse.json({ code: "unknown" });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  });
  if (user && user.role !== "ADMIN") {
    return NextResponse.json({ code: "dealer_not_admin" });
  }
  return NextResponse.json({ code: "unknown" });
}

import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { isLoginBlocked } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email?.trim()) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();
  const ip = getClientIp(req);

  if (isLoginBlocked(normalized, ip)) {
    return NextResponse.json(
      {
        blocked: true,
        error: "rate_limit",
        message:
          "בוצעו יותר מדי ניסיונות התחברות. נסה שוב בעוד מספר דקות.",
      },
      { status: 429 }
    );
  }

  return NextResponse.json({ blocked: false });
}

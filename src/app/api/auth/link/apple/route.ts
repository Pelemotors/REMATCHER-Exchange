import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { verifyAppleIdToken } from "@/services/identity/apple-provider";
import {
  linkProviderToUser,
  IdentityLinkError,
} from "@/services/identity/account-linking";

const bodySchema = z.object({
  idToken: z.string().min(10),
  nonce: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const verified = await verifyAppleIdToken(parsed.data.idToken, {
      nonce: parsed.data.nonce,
    });
    const linked = await linkProviderToUser(session.user.id, {
      provider: "APPLE",
      subject: verified.subject,
      verifiedEmail: verified.email,
      emailVerified: verified.emailVerified,
      rawProfile: verified.raw,
    });
    return NextResponse.json({ ok: true, identityId: linked.id });
  } catch (err) {
    if (err instanceof IdentityLinkError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Link failed" },
      { status: 400 }
    );
  }
}

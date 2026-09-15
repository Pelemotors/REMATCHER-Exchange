import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { verifyGoogleIdToken } from "@/services/identity/google-provider";
import {
  linkProviderToUser,
  IdentityLinkError,
} from "@/services/identity/account-linking";

const bodySchema = z.object({
  idToken: z.string().min(10),
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
    const verified = await verifyGoogleIdToken(parsed.data.idToken);
    const linked = await linkProviderToUser(session.user.id, {
      provider: "GOOGLE",
      subject: verified.subject,
      verifiedEmail: verified.email,
      emailVerified: verified.emailVerified,
      displayName: verified.name,
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

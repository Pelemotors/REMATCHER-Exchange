import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyGoogleIdToken } from "@/services/identity/google-provider";
import {
  findOrCreateFromProvider,
  IdentityLinkError,
} from "@/services/identity/account-linking";
import { createOAuthBridgeToken } from "@/services/identity/oauth-bridge";
import { registerOrUpdateInstallation } from "@/services/devices/installations";

const bodySchema = z.object({
  idToken: z.string().min(10),
  installationId: z.string().optional(),
  platform: z.enum(["IOS", "ANDROID", "WEB"]).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const verified = await verifyGoogleIdToken(parsed.data.idToken);

    const result = await findOrCreateFromProvider({
      provider: "GOOGLE",
      subject: verified.subject,
      verifiedEmail: verified.email,
      emailVerified: verified.emailVerified,
      displayName: verified.name,
      rawProfile: verified.raw,
    });

    if (parsed.data.installationId) {
      await registerOrUpdateInstallation({
        installationId: parsed.data.installationId,
        platform: parsed.data.platform ?? "ANDROID",
        userId: result.user.id,
        dealerId: result.dealerId,
      });
    }

    const bridgeToken = await createOAuthBridgeToken(result.user.id);

    return NextResponse.json({
      ok: true,
      userId: result.user.id,
      dealerId: result.dealerId,
      needsDealerProfile: result.needsDealerProfile,
      created: result.created,
      bridgeToken,
    });
  } catch (err) {
    if (err instanceof IdentityLinkError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.code === "TAKEOVER_REJECTED" ? 409 : 400 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Google auth failed" },
      { status: 401 }
    );
  }
}

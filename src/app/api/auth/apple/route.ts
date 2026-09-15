import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAppleIdToken } from "@/services/identity/apple-provider";
import { findOrCreateFromProvider } from "@/services/identity/account-linking";
import { createOAuthBridgeToken } from "@/services/identity/oauth-bridge";
import { registerOrUpdateInstallation } from "@/services/devices/installations";
import { IdentityLinkError } from "@/services/identity/account-linking";

const bodySchema = z.object({
  idToken: z.string().min(10),
  nonce: z.string().optional(),
  name: z.string().optional(),
  installationId: z.string().optional(),
  platform: z.enum(["IOS", "ANDROID", "WEB"]).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const verified = await verifyAppleIdToken(parsed.data.idToken, {
      nonce: parsed.data.nonce,
    });

    const result = await findOrCreateFromProvider({
      provider: "APPLE",
      subject: verified.subject,
      verifiedEmail: verified.email,
      emailVerified: verified.emailVerified,
      displayName: parsed.data.name ?? null,
      rawProfile: verified.raw,
    });

    if (parsed.data.installationId) {
      await registerOrUpdateInstallation({
        installationId: parsed.data.installationId,
        platform: parsed.data.platform ?? "IOS",
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
      { error: err instanceof Error ? err.message : "Apple auth failed" },
      { status: 401 }
    );
  }
}

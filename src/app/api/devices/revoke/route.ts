import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth-guards";
import { revokeInstallation } from "@/services/devices/installations";

const schema = z.object({
  installationId: z.string().optional(),
  pushToken: z.string().optional(),
  all: z.boolean().optional(),
});

export async function POST(req: Request) {
  const authz = await requireSession();
  if ("error" in authz) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const result = await revokeInstallation({
    installationId: parsed.data.installationId,
    pushToken: parsed.data.pushToken,
    userId: parsed.data.all || !parsed.data.installationId
      ? authz.session.user.id
      : undefined,
  });

  return NextResponse.json({ ok: true, ...result });
}

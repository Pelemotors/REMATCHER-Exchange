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

  const userId = authz.session.user.id;
  const result = await revokeInstallation({
    userId,
    installationId: parsed.data.all ? undefined : parsed.data.installationId,
    pushToken: parsed.data.all ? undefined : parsed.data.pushToken,
  });

  return NextResponse.json({ ok: true, ...result });
}

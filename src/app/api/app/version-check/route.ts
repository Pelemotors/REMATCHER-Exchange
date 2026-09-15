import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  platform: z.enum(["IOS", "ANDROID", "WEB"]),
  appVersion: z.string().min(1),
  buildNumber: z.string().optional(),
});

/** Compare dotted semver-ish versions: returns -1/0/1 */
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, "").split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const policy = await prisma.appVersionPolicy.findUnique({
    where: { platform: parsed.data.platform },
  });

  if (!policy) {
    return NextResponse.json({
      supported: true,
      updateAvailable: false,
      updateRequired: false,
      latestVersion: null,
      minimumSupportedVersion: null,
      messageHe: null,
    });
  }

  const current = parsed.data.appVersion;
  const latest = policy.latestVersion;
  const minimum = policy.minimumSupportedVersion;

  const updateRequired = Boolean(
    minimum && compareVersions(current, minimum) < 0
  );
  const updateAvailable = Boolean(
    latest && compareVersions(current, latest) < 0
  );

  return NextResponse.json({
    supported: !updateRequired,
    updateAvailable,
    updateRequired,
    latestVersion: latest,
    minimumSupportedVersion: minimum,
    messageHe: policy.updateMessageHe,
    buildNumber: parsed.data.buildNumber ?? null,
  });
}

import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveMediaAbsolutePath } from "@/lib/media/storage";
import { BUYER_VISIBLE_MATCH_WHERE } from "@/services/domain/candidate-policy";

type Params = { params: Promise<{ key: string[] }> };

/**
 * Authenticated media serve.
 * Buyers may only see media for vehicles that appear in their buyer-visible matches
 * OR dealers may see their own inventory media.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parts = (await params).key ?? [];
  const storageKey = parts.map((p) => decodeURIComponent(p)).join("/");
  if (!storageKey.startsWith("vehicles/") && !storageKey.startsWith("intake/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Intake media: owner-only (not buyer-visible until committed to VehicleMedia)
  if (storageKey.startsWith("intake/")) {
    const parts = storageKey.split("/");
    const ownerDealerId = parts[1];
    if (!ownerDealerId || ownerDealerId !== session.user.dealerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    try {
      const abs = resolveMediaAbsolutePath(storageKey);
      const info = await stat(abs);
      const stream = createReadStream(abs);
      const webStream = Readable.toWeb(stream) as unknown as ReadableStream;
      return new NextResponse(webStream, {
        headers: {
          "Content-Type": "image/webp",
          "Content-Length": String(info.size),
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const media = await prisma.vehicleMedia.findFirst({
    where: {
      OR: [
        { storageKey },
        // allow thumb path to resolve to same ownership as display
        {
          storageKey: storageKey.replace(/\/thumb-/, "/display-"),
        },
      ],
    },
    include: { vehicle: { select: { id: true, dealerId: true } } },
  });
  if (!media) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dealerId = session.user.dealerId;
  const owns = media.vehicle.dealerId === dealerId;
  let buyerVisible = false;
  if (!owns) {
    const match = await prisma.candidateMatch.findFirst({
      where: {
        vehicleId: media.vehicle.id,
        demand: { dealerId },
        ...BUYER_VISIBLE_MATCH_WHERE,
      },
      select: { id: true },
    });
    buyerVisible = Boolean(match);
  }
  if (!owns && !buyerVisible) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const abs = resolveMediaAbsolutePath(storageKey);
    const info = await stat(abs);
    const stream = createReadStream(abs);
    const webStream = Readable.toWeb(stream) as unknown as ReadableStream;
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": media.mimeType || "image/webp",
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

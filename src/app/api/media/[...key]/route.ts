import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { resolveMediaAbsolutePath } from "@/lib/media/storage";
import { resolveMediaPrincipal } from "@/lib/media/media-auth";
import { BUYER_VISIBLE_MATCH_WHERE } from "@/services/domain/candidate-policy";
import { v1ErrorBody, V1_STATUS_BY_CODE, type V1ErrorCode } from "@/lib/api-v1/errors";

type Params = { params: Promise<{ key: string[] }> };

function authFailureResponse(
  failure: { status: 401 | 403; code: string },
  requestId: string | null
) {
  const code = failure.code as V1ErrorCode;
  if (code in V1_STATUS_BY_CODE) {
    return NextResponse.json(v1ErrorBody(code, requestId ?? "media"), {
      status: V1_STATUS_BY_CODE[code],
    });
  }
  return NextResponse.json(
    { error: failure.status === 401 ? "Unauthorized" : "Forbidden", code: failure.code },
    { status: failure.status }
  );
}

/**
 * Authenticated media serve (Web cookie OR Mobile Bearer).
 * Buyers may only see media for vehicles that appear in their buyer-visible matches
 * OR dealers may see their own inventory media.
 * Intake media: owning dealer only.
 */
export async function GET(req: Request, { params }: Params) {
  const requestId = req.headers.get("x-request-id");
  const authResult = await resolveMediaPrincipal(req);
  if (!authResult.ok) {
    return authFailureResponse(authResult, requestId);
  }
  const dealerId = authResult.principal.dealerId;

  const parts = (await params).key ?? [];
  const storageKey = parts.map((p) => decodeURIComponent(p)).join("/");
  if (!storageKey.startsWith("vehicles/") && !storageKey.startsWith("intake/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Path traversal / invalid key — deny without exposing filesystem paths.
  try {
    resolveMediaAbsolutePath(storageKey);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Intake media: owner-only (not buyer-visible until committed to VehicleMedia)
  if (storageKey.startsWith("intake/")) {
    const keyParts = storageKey.split("/");
    const ownerDealerId = keyParts[1];
    if (!ownerDealerId || ownerDealerId !== dealerId) {
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

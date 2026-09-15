import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import {
  acknowledgeIntakeBatch,
  addIntakeMedia,
  addIntakeText,
  createOrResumeIntakeBatch,
  getIntakeBatchForDealer,
  listIntakeBatchesForDealer,
} from "@/services/intake/batch";
import { checkIntakeRateLimit } from "@/services/intake/rate-limit";
import type { IntakeSource } from "@prisma/client";

const SOURCES = new Set([
  "IOS_SHARE",
  "ANDROID_SHARE",
  "WEB_UPLOAD",
  "MANUAL",
  "IMPORT",
]);

export async function GET(req: Request) {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }
  const dealerId = authResult.session.user.dealerId!;
  const url = new URL(req.url);
  const batchId = url.searchParams.get("batchId");
  if (!batchId) {
    const list = await listIntakeBatchesForDealer(dealerId);
    return NextResponse.json({ batches: list });
  }
  const result = await getIntakeBatchForDealer({ dealerId, batchId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json(result.batch);
}

/** Create/resume batch, upload media, add text, or ACK */
export async function POST(req: Request) {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }
  const dealerId = authResult.session.user.dealerId!;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const limited = checkIntakeRateLimit({ dealerId, kind: "upload" });
    if (limited.blocked) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: limited.retryAfterMs
            ? { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) }
            : undefined,
        }
      );
    }
    const form = await req.formData();
    const batchId = String(form.get("batchId") ?? "");
    const file = form.get("file");
    const orderRaw = form.get("originalOrder");
    if (!batchId || !(file instanceof File)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const result = await addIntakeMedia({
      dealerId,
      batchId,
      file,
      originalOrder:
        orderRaw != null && String(orderRaw) !== ""
          ? Number(orderRaw)
          : undefined,
    });
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "limit"
            ? 413
            : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json(result);
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    batchId?: string;
    clientBatchId?: string;
    source?: string;
    sourceMetadata?: Record<string, unknown>;
    text?: string;
  };

  if (body.action === "ack" && body.batchId) {
    const limited = checkIntakeRateLimit({ dealerId, kind: "ack" });
    if (limited.blocked) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    const result = await acknowledgeIntakeBatch({
      dealerId,
      batchId: body.batchId,
    });
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    void import("@/services/intake/process-batch")
      .then((m) => m.processIntakeBatch(dealerId, result.batchId))
      .catch((err) => {
        console.error("[intake] processIntakeBatch failed", err);
      });
    return NextResponse.json(result);
  }

  if (body.action === "add_text" && body.batchId && body.text) {
    const result = await addIntakeText({
      dealerId,
      batchId: body.batchId,
      text: body.text,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (
    body.action === "create" &&
    body.clientBatchId &&
    body.source &&
    SOURCES.has(body.source)
  ) {
    const limited = checkIntakeRateLimit({ dealerId, kind: "create" });
    if (limited.blocked) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    const result = await createOrResumeIntakeBatch({
      dealerId,
      clientBatchId: body.clientBatchId,
      source: body.source as IntakeSource,
      sourceMetadata: body.sourceMetadata,
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "invalid_request" }, { status: 400 });
}

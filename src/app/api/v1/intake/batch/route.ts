import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
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

export const dynamic = "force-dynamic";

const SOURCES = new Set([
  "IOS_SHARE",
  "ANDROID_SHARE",
  "WEB_UPLOAD",
  "MANUAL",
  "IMPORT",
]);

/** Thin wrap of Web GET /api/intake/batch — principal.dealerId only. */
export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const url = new URL(req.url);
  const batchId = url.searchParams.get("batchId");
  if (!batchId) {
    const list = await listIntakeBatchesForDealer(principal.dealerId);
    return v1Json(ctx, { batches: list });
  }
  const result = await getIntakeBatchForDealer({
    dealerId: principal.dealerId,
    batchId,
  });
  if (!result.ok) {
    return v1Error(ctx, "RESOURCE_NOT_FOUND");
  }
  return v1Json(ctx, result.batch);
}

/** Thin wrap of Web POST /api/intake/batch (create / media / text / ack). */
export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const dealerId = principal.dealerId;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const limited = checkIntakeRateLimit({ dealerId, kind: "upload" });
    if (limited.blocked) {
      return v1Error(ctx, "RATE_LIMIT_EXCEEDED");
    }
    const form = await req.formData();
    const batchId = String(form.get("batchId") ?? "");
    const file = form.get("file");
    const orderRaw = form.get("originalOrder");
    if (!batchId || !(file instanceof File)) {
      return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
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
      if (result.error === "not_found") {
        return v1Error(ctx, "RESOURCE_NOT_FOUND");
      }
      if (result.error === "limit") {
        return v1Error(ctx, "VALIDATION_FAILED");
      }
      return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
    }
    return v1Json(ctx, result);
  }

  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as {
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
      return v1Error(ctx, "RATE_LIMIT_EXCEEDED");
    }
    const result = await acknowledgeIntakeBatch({
      dealerId,
      batchId: body.batchId,
    });
    if (!result.ok) {
      return v1Error(
        ctx,
        result.error === "not_found"
          ? "RESOURCE_NOT_FOUND"
          : "VALIDATION_INVALID_REQUEST"
      );
    }
    void import("@/services/intake/process-batch")
      .then((m) => m.processIntakeBatch(dealerId, result.batchId))
      .catch((err) => {
        console.error("[intake] processIntakeBatch failed", err);
      });
    return v1Json(ctx, result);
  }

  if (body.action === "add_text" && body.batchId && body.text) {
    const result = await addIntakeText({
      dealerId,
      batchId: body.batchId,
      text: body.text,
    });
    if (!result.ok) {
      return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
    }
    return v1Json(ctx, result);
  }

  if (
    body.action === "create" &&
    body.clientBatchId &&
    body.source &&
    SOURCES.has(body.source)
  ) {
    const limited = checkIntakeRateLimit({ dealerId, kind: "create" });
    if (limited.blocked) {
      return v1Error(ctx, "RATE_LIMIT_EXCEEDED");
    }
    const result = await createOrResumeIntakeBatch({
      dealerId,
      clientBatchId: body.clientBatchId,
      source: body.source as IntakeSource,
      sourceMetadata: body.sourceMetadata,
    });
    return v1Json(ctx, result);
  }

  return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
}

import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { createThread, listThreads } from "@/services/conversation/threads";
import type { ConversationThreadSource } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam === "ACTIVE" ||
    statusParam === "ARCHIVED" ||
    statusParam === "DELETED"
      ? statusParam
      : undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const result = await listThreads({
    principal: { userId: principal.userId, dealerId: principal.dealerId },
    status,
    cursor,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  return v1Json(ctx, result);
}

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Record<string, unknown>;

  const source = body.source as ConversationThreadSource | undefined;
  const allowedSources: ConversationThreadSource[] = [
    "AGENT",
    "HOME_CAPTURE",
    "IOS_SHARE",
    "CAMERA",
    "PHOTO_LIBRARY",
    "TEXT",
    "CUSTOMER_SCREENSHOT",
    "OTHER",
  ];
  if (source && !allowedSources.includes(source)) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const thread = await createThread({
    principal: { userId: principal.userId, dealerId: principal.dealerId },
    title: typeof body.title === "string" ? body.title : undefined,
    source: source ?? "OTHER",
    visibility:
      body.visibility === "DEALER_SHARED" ? "DEALER_SHARED" : "PRIVATE_USER",
  });
  return v1Json(ctx, { thread });
}

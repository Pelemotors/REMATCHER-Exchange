import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { serializeThreadDTO } from "@/services/conversation/dto";
import { fetchThreadPresentationExtras } from "@/services/conversation/thread-presentation";
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
  const q = url.searchParams.get("q") ?? undefined;

  const p = { userId: principal.userId, dealerId: principal.dealerId };
  const result = await listThreads({
    principal: p,
    status,
    cursor,
    limit: Number.isFinite(limit) ? limit : undefined,
    q,
  });

  const threads = await Promise.all(
    result.threads.map(async (t) => {
      const extras = await fetchThreadPresentationExtras(p, t.id);
      return serializeThreadDTO(t, extras);
    })
  );

  return v1Json(ctx, { threads, nextCursor: result.nextCursor });
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

  const row = await createThread({
    principal: { userId: principal.userId, dealerId: principal.dealerId },
    title: typeof body.title === "string" ? body.title : undefined,
    source: source ?? "OTHER",
    visibility:
      body.visibility === "DEALER_SHARED" ? "DEALER_SHARED" : "PRIVATE_USER",
  });
  const p = { userId: principal.userId, dealerId: principal.dealerId };
  const extras = await fetchThreadPresentationExtras(p, row.id);
  return v1Json(ctx, { thread: serializeThreadDTO(row, extras) });
}

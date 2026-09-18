import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { appendMessage, listMessages } from "@/services/conversation/messages";

export const dynamic = "force-dynamic";

function principalFrom(auth: { userId: string; dealerId: string }) {
  return { userId: auth.userId, dealerId: auth.dealerId };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  try {
    const result = await listMessages({
      principal: principalFrom(principal),
      threadId: id,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return v1Json(ctx, result);
  } catch {
    return v1Error(ctx, "RESOURCE_NOT_FOUND");
  }
}

/** User text only — Phase A does not run the agent loop here. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined;

  try {
    const { message, created } = await appendMessage(principalFrom(principal), {
      threadId: id,
      role: "USER",
      kind: "TEXT",
      text,
      idempotencyKey: idempotencyKey ?? null,
      source: "api_v1",
    });
    return v1Json(ctx, {
      message,
      created,
      agentHandoff: { pending: true, hint: "use_assistant_chat_for_agent_turn" },
    });
  } catch {
    return v1Error(ctx, "RESOURCE_NOT_FOUND");
  }
}

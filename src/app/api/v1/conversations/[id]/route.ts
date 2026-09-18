import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  archiveThread,
  getThread,
  renameThread,
  restoreThread,
  softDeleteThread,
} from "@/services/conversation/threads";

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
  const thread = await getThread(principalFrom(principal), id);
  if (!thread) return v1Error(ctx, "RESOURCE_NOT_FOUND");
  return v1Json(ctx, { thread });
}

export async function PATCH(
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
  const p = principalFrom(principal);

  if (body.action === "archive") {
    const thread = await archiveThread(p, id);
    if (!thread) return v1Error(ctx, "RESOURCE_NOT_FOUND");
    return v1Json(ctx, { thread });
  }
  if (body.action === "restore") {
    const thread = await restoreThread(p, id);
    if (!thread) return v1Error(ctx, "RESOURCE_NOT_FOUND");
    return v1Json(ctx, { thread });
  }
  if (typeof body.title === "string") {
    const thread = await renameThread({
      principal: p,
      threadId: id,
      title: body.title,
    });
    if (!thread) return v1Error(ctx, "RESOURCE_NOT_FOUND");
    return v1Json(ctx, { thread });
  }

  return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;
  const thread = await softDeleteThread(principalFrom(principal), id);
  if (!thread) return v1Error(ctx, "RESOURCE_NOT_FOUND");
  return v1Json(ctx, { thread });
}

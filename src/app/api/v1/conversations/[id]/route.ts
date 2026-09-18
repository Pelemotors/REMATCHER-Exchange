import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { serializeThreadDTO } from "@/services/conversation/dto";
import { listThreadIntakeMedia } from "@/services/conversation/media";
import { fetchThreadPresentationExtras } from "@/services/conversation/thread-presentation";
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
  const p = principalFrom(principal);
  const thread = await getThread(p, id);
  if (!thread) return v1Error(ctx, "RESOURCE_NOT_FOUND");

  const url = new URL(req.url);
  const includeMedia = url.searchParams.get("include") === "media";
  const extras = await fetchThreadPresentationExtras(p, id);
  const dto = serializeThreadDTO(thread, extras);
  if (includeMedia) {
    const media = await listThreadIntakeMedia(p, id);
    return v1Json(ctx, { thread: dto, media });
  }
  return v1Json(ctx, { thread: dto });
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

  let row = null;
  if (body.action === "archive") {
    row = await archiveThread(p, id);
  } else if (body.action === "restore") {
    row = await restoreThread(p, id);
  } else if (typeof body.title === "string") {
    row = await renameThread({
      principal: p,
      threadId: id,
      title: body.title,
    });
  } else {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  if (!row) return v1Error(ctx, "RESOURCE_NOT_FOUND");
  const extras = await fetchThreadPresentationExtras(p, id);
  return v1Json(ctx, { thread: serializeThreadDTO(row, extras) });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;
  const p = principalFrom(principal);
  const row = await softDeleteThread(p, id);
  if (!row) return v1Error(ctx, "RESOURCE_NOT_FOUND");
  const extras = await fetchThreadPresentationExtras(p, id);
  return v1Json(ctx, { thread: serializeThreadDTO(row, extras) });
}

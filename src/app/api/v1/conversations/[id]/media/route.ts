import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { listThreadIntakeMedia } from "@/services/conversation/media";
import { ConversationAccessError } from "@/services/conversation/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;
  try {
    const items = await listThreadIntakeMedia(
      { userId: principal.userId, dealerId: principal.dealerId },
      id
    );
    return v1Json(ctx, { items });
  } catch (e) {
    if (e instanceof ConversationAccessError) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    throw e;
  }
}

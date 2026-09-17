import { z } from "zod";
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  getRevealForDealer,
  submitOutcome,
} from "@/services/commercial/reveal-flow";

export const dynamic = "force-dynamic";

const outcomeSchema = z.object({
  status: z.enum([
    "DEAL_CLOSED",
    "STILL_IN_PROGRESS",
    "PRICE_DIDNT_WORK",
    "VEHICLE_DIDNT_FIT",
    "DID_NOT_PROGRESS",
  ]),
  notes: z.string().max(2000).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;

  try {
    const reveal = await getRevealForDealer(id, principal.dealerId);
    return v1Json(ctx, reveal);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return v1Error(ctx, "PERMISSION_FORBIDDEN");
    }
    return v1Error(ctx, "PERMISSION_FORBIDDEN");
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;
  const parsedJson = await parseV1Json(req, ctx);
  if (!parsedJson.ok) return parsedJson.response;

  const parsed = outcomeSchema.safeParse(parsedJson.body);
  if (!parsed.success) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  try {
    const outcome = await submitOutcome({
      revealId: id,
      dealerId: principal.dealerId,
      status: parsed.data.status,
      notes: parsed.data.notes,
    });
    return v1Json(ctx, outcome);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return v1Error(ctx, "PERMISSION_FORBIDDEN");
    }
    throw e;
  }
}

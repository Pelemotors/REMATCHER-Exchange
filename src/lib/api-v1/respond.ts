import { NextResponse } from "next/server";
import {
  httpStatusForCode,
  v1ErrorBody,
  type V1ErrorCode,
} from "@/lib/api-v1/errors";
import type { V1RequestContext } from "@/lib/api-v1/request-context";

export function v1Headers(ctx: V1RequestContext, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("X-Request-Id", ctx.requestId);
  headers.set("X-Api-Version", "v1");
  return headers;
}

export function v1Json<T>(
  ctx: V1RequestContext,
  body: T,
  status = 200
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: v1Headers(ctx),
  });
}

export function v1Error(
  ctx: V1RequestContext,
  code: V1ErrorCode,
  message?: string
): NextResponse {
  return NextResponse.json(v1ErrorBody(code, ctx.requestId, message), {
    status: httpStatusForCode(code),
    headers: v1Headers(ctx),
  });
}

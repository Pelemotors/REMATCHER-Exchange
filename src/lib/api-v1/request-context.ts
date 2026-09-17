import { randomUUID } from "node:crypto";

export type V1ClientPlatform = "ios" | "android" | "web" | "unknown";
export type V1ClientEnv = "dev" | "fieldtest" | "production" | "unknown";

export type V1RequestContext = {
  requestId: string;
  platform: V1ClientPlatform;
  version: string | null;
  build: string | null;
  env: V1ClientEnv;
};

function firstHeader(req: Request, name: string): string | null {
  const value = req.headers.get(name)?.trim();
  return value || null;
}

function platformFrom(raw: string | null): V1ClientPlatform {
  if (raw === "ios" || raw === "android" || raw === "web") return raw;
  return "unknown";
}

function envFrom(raw: string | null): V1ClientEnv {
  if (raw === "dev" || raw === "fieldtest" || raw === "production") return raw;
  return "unknown";
}

/** Incoming X-Request-Id if well-formed, otherwise a new id. Always returned. */
export function resolveV1RequestContext(req: Request): V1RequestContext {
  const incoming = firstHeader(req, "x-request-id");
  const requestId =
    incoming && incoming.length >= 8 && incoming.length <= 80
      ? incoming
      : `req_${randomUUID()}`;

  return {
    requestId,
    platform: platformFrom(firstHeader(req, "x-client-platform")?.toLowerCase() ?? null),
    version: firstHeader(req, "x-client-version"),
    build: firstHeader(req, "x-client-build"),
    env: envFrom(firstHeader(req, "x-client-env")?.toLowerCase() ?? null),
  };
}

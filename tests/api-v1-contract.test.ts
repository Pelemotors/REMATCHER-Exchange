import { describe, expect, it } from "vitest";
import {
  httpStatusForCode,
  V1_ERROR_CODES,
  v1ErrorBody,
} from "@/lib/api-v1/errors";
import { resolveV1RequestContext } from "@/lib/api-v1/request-context";
import { GET as v1Health } from "@/app/api/v1/health/route";
import { GET as v1Me } from "@/app/api/v1/me/route";

describe("v1 error contract", () => {
  it("maps stable codes to HTTP status", () => {
    expect(httpStatusForCode("AUTH_UNAUTHENTICATED")).toBe(401);
    expect(httpStatusForCode("PERMISSION_FORBIDDEN")).toBe(403);
    expect(httpStatusForCode("RESOURCE_NOT_FOUND")).toBe(404);
    expect(httpStatusForCode("MATCH_STALE_OPPORTUNITY")).toBe(409);
    expect(httpStatusForCode("VALIDATION_FAILED")).toBe(422);
    expect(httpStatusForCode("RATE_LIMIT_EXCEEDED")).toBe(429);
    expect(httpStatusForCode("REVEAL_ALLOWANCE_EXHAUSTED")).toBe(402);
    expect(httpStatusForCode("SERVER_INTERNAL")).toBe(500);
  });

  it("envelope always includes code, message, requestId", () => {
    const body = v1ErrorBody("AUTH_UNAUTHENTICATED", "req_test");
    expect(body.error.code).toBe(V1_ERROR_CODES.AUTH_UNAUTHENTICATED);
    expect(body.error.requestId).toBe("req_test");
    expect(body.error.message.length).toBeGreaterThan(0);
  });
});

describe("v1 request context", () => {
  it("echoes a well-formed X-Request-Id", () => {
    const ctx = resolveV1RequestContext(
      new Request("http://local/api/v1/health", {
        headers: {
          "x-request-id": "req_client_abc123",
          "x-client-platform": "ios",
          "x-client-env": "fieldtest",
        },
      })
    );
    expect(ctx.requestId).toBe("req_client_abc123");
    expect(ctx.platform).toBe("ios");
    expect(ctx.env).toBe("fieldtest");
  });

  it("mints an id when header is missing", () => {
    const ctx = resolveV1RequestContext(new Request("http://local/api/v1/health"));
    expect(ctx.requestId.startsWith("req_")).toBe(true);
    expect(ctx.platform).toBe("unknown");
  });
});

describe("GET /api/v1/health", () => {
  it("returns public subset with requestId header", async () => {
    const res = await v1Health(
      new Request("http://local/api/v1/health", {
        headers: { "x-request-id": "req_health_fixture" },
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Request-Id")).toBe("req_health_fixture");
    expect(res.headers.get("X-Api-Version")).toBe("v1");
    const json = (await res.json()) as {
      apiVersion: string;
      requestId: string;
      status: string;
    };
    expect(json.apiVersion).toBe("v1");
    expect(json.requestId).toBe("req_health_fixture");
    expect(json.status).toBe("ok");
    expect(JSON.stringify(json)).not.toMatch(/killSwitch/i);
  });
});

describe("GET /api/v1/me", () => {
  it("uses the v1 envelope when unauthenticated", async () => {
    const res = await v1Me(
      new Request("http://local/api/v1/me", {
        headers: { "x-request-id": "req_me_fixture" },
      })
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    expect(json.error.code).toBe("AUTH_UNAUTHENTICATED");
    expect(json.error.requestId).toBe("req_me_fixture");
    expect(json.error.message).toBeTruthy();
  });
});

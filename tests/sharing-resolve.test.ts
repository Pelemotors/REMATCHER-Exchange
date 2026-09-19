import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SHARE_ACTIONS,
  SHARE_KINDS,
  isShareAction,
  isShareKind,
} from "@/services/sharing/sharing-service";
import { catalogPublicUrl } from "@/services/catalog/public-url";

function readSrc(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("outbound share policy", () => {
  it("allows only catalog, vehicle, demand", () => {
    expect(SHARE_KINDS).toEqual(["CATALOG", "VEHICLE", "DEMAND"]);
    expect(isShareKind("CUSTOMER")).toBe(false);
    expect(isShareKind("CONVERSATION")).toBe(false);
  });

  it("records opened actions, never sent/delivered", () => {
    expect(isShareAction("WHATSAPP_OPENED")).toBe(true);
    expect(isShareAction("WHATSAPP_SENT")).toBe(false);
    expect(SHARE_ACTIONS).not.toContain("WHATSAPP_SENT");
  });

  it("reuses AppEvent instead of a ShareEvent table", () => {
    const service = readSrc("src/services/sharing/sharing-service.ts");
    expect(service).toContain("logAppEvent");
    expect(service).not.toMatch(/prisma\.shareEvent/);
    const schema = readSrc("prisma/schema.prisma");
    expect(schema).not.toMatch(/model ShareEvent/);
  });

  it("never puts preview tokens or dealerId in the public payload builder", () => {
    const src = readSrc("src/services/sharing/sharing-service.ts");
    expect(src).toContain("catalogPublicUrl");
    expect(src).not.toContain("preview");
    expect(src).not.toMatch(/rawText|customerName|normalizedPhone/);
  });

  it("catalog URL stays backend-authored", () => {
    expect(catalogPublicUrl("galeria-test")).toBe(
      "https://galeria-test.rematcher.co.il"
    );
  });

  it("OpenAPI documents resolve + events", () => {
    const yaml = readSrc("docs/api/v1-openapi.yaml");
    expect(yaml).toContain("/api/v1/sharing/resolve");
    expect(yaml).toContain("/api/v1/sharing/events");
  });
});

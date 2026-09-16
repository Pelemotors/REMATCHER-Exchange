import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chatCompletionLength,
  modelUsesMaxCompletionTokens,
  sanitizeChatCompletionParams,
} from "@/services/ai/chat-completion-params";

const root = process.cwd();

function src(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function plateOcrRequest(model: string) {
  return sanitizeChatCompletionParams({
    model,
    temperature: 0,
    ...chatCompletionLength(model, 200),
    messages: [
      { role: "system", content: "Extract Israeli vehicle license plate numbers" },
      { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,xx" } }] },
    ],
    response_format: { type: "json_object" as const },
  });
}

function mediaVisionRequest(model: string) {
  return sanitizeChatCompletionParams({
    model,
    temperature: 0,
    ...chatCompletionLength(model, 350),
    messages: [
      { role: "system", content: "You extract uncertain visual hints" },
      { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,xx" } }] },
    ],
    response_format: { type: "json_object" as const },
  });
}

function agentLoopRequest(model: string) {
  return sanitizeChatCompletionParams({
    model,
    messages: [{ role: "user", content: "שלום" }],
    tools: [{ type: "function" as const, function: { name: "noop" } }],
    tool_choice: "auto" as const,
    temperature: 0.2,
  });
}

function structuredRequest(model: string) {
  return sanitizeChatCompletionParams({
    model,
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "user" },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: { name: "parsed_demand", strict: true, schema: { type: "object" } },
    },
    temperature: 0.1,
  });
}

describe("OpenAI token-limit contract", () => {
  it("classifies gpt-5.4-mini vs gpt-4o-mini", () => {
    expect(modelUsesMaxCompletionTokens("gpt-5.4-mini")).toBe(true);
    expect(modelUsesMaxCompletionTokens("gpt-4o-mini")).toBe(false);
    expect(modelUsesMaxCompletionTokens("o3-mini")).toBe(true);
  });

  it("gpt-5.4-mini plate OCR request never emits max_tokens", () => {
    const req = plateOcrRequest("gpt-5.4-mini");
    expect(req.model).toBe("gpt-5.4-mini");
    expect(req.max_completion_tokens).toBe(200);
    expect(req).not.toHaveProperty("max_tokens");
    expect(req).not.toHaveProperty("max_output_tokens");
    expect(req.response_format).toEqual({ type: "json_object" });
    expect(req.temperature).toBe(0);
    expect(req.messages).toHaveLength(2);
  });

  it("gpt-5.4-mini media vision request never emits max_tokens", () => {
    const req = mediaVisionRequest("gpt-5.4-mini");
    expect(req.max_completion_tokens).toBe(350);
    expect(req).not.toHaveProperty("max_tokens");
    expect(req.temperature).toBe(0);
    expect(req.response_format).toEqual({ type: "json_object" });
  });

  it("rewrites a raw max_tokens gpt-5.4-mini payload (the live 400)", () => {
    const req = sanitizeChatCompletionParams({
      model: "gpt-5.4-mini",
      temperature: 0,
      max_tokens: 200,
      messages: [],
    });
    expect(req.max_completion_tokens).toBe(200);
    expect(req).not.toHaveProperty("max_tokens");
    expect(req.temperature).toBe(0);
    expect(req.messages).toEqual([]);
  });

  it("gpt-5.4-mini agent loop request stays without a token-limit field", () => {
    const req = agentLoopRequest("gpt-5.4-mini");
    expect(req.model).toBe("gpt-5.4-mini");
    expect(req).not.toHaveProperty("max_tokens");
    expect(req).not.toHaveProperty("max_completion_tokens");
    expect(req.tool_choice).toBe("auto");
    expect(req.temperature).toBe(0.2);
    expect(req.tools).toHaveLength(1);
  });

  it("gpt-4o-mini vehicle identity request stays intact without token-limit fields", () => {
    const req = structuredRequest("gpt-4o-mini");
    expect(req.model).toBe("gpt-4o-mini");
    expect(req).not.toHaveProperty("max_tokens");
    expect(req).not.toHaveProperty("max_completion_tokens");
    expect(req.temperature).toBe(0.1);
    expect(req.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "parsed_demand" },
    });
  });

  it("gpt-4o-mini demand parse request keeps max_tokens when a limit is set", () => {
    const req = sanitizeChatCompletionParams({
      ...structuredRequest("gpt-4o-mini"),
      max_tokens: 400,
    });
    expect(req.max_tokens).toBe(400);
    expect(req).not.toHaveProperty("max_completion_tokens");
  });
});

describe("OpenAI call sites go through the shared wrapper", () => {
  it("getOpenAIClient sanitizes every chat.completions.create", () => {
    const client = src("src/services/ai/client.ts");
    expect(client).toContain("sanitizeChatCompletionParams");
    expect(client).toContain("inner.chat.completions.create");
  });

  it("plate OCR, media vision, agent loop, structured identity/demand use getOpenAIClient", () => {
    expect(src("src/services/intake/plate-ocr.ts")).toContain("getOpenAIClient");
    expect(src("src/services/intake/plate-ocr.ts")).toContain(
      "chat.completions.create"
    );
    expect(src("src/services/intake/media-vision.ts")).toContain("getOpenAIClient");
    expect(src("src/services/assistant/agent-loop.ts")).toContain("getOpenAIClient");
    expect(src("src/services/assistant/agent-loop.ts")).not.toMatch(/max_tokens\s*:/);
    expect(src("src/services/ai/client.ts")).toContain("callOpenAIStructured");
    expect(src("src/services/ai/demand-parser.ts")).toContain("callOpenAIStructured");
    expect(src("src/services/ai/demand-parser.ts")).toContain("demand_parse");
    expect(src("src/services/exchange/vehicle-intelligence.ts")).toContain(
      "exchange_vehicle_identity"
    );
    expect(src("src/services/exchange/vehicle-intelligence.ts")).toContain(
      "callOpenAIStructured"
    );
  });

  it("no call site sends max_tokens except via the sanitizer/helper", () => {
    const files = [
      "src/services/intake/plate-ocr.ts",
      "src/services/intake/media-vision.ts",
      "src/services/assistant/agent-loop.ts",
      "src/services/exchange/intelligence-shadow.ts",
      "src/services/ai/demand-parser.ts",
      "src/services/exchange/vehicle-intelligence.ts",
    ];
    for (const f of files) {
      const text = src(f);
      expect(text, f).not.toMatch(/max_tokens:\s*\d+/);
      expect(text, f).not.toMatch(/max_output_tokens:\s*\d+/);
    }
  });
});

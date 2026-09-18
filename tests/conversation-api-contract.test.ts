import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const fixtureDir = join(__dirname, "fixtures/conversation-api");

const threadDtoKeys = new Set([
  "id",
  "title",
  "titleSource",
  "status",
  "source",
  "visibility",
  "lastMessageAt",
]);

const messageDtoKeys = new Set([
  "id",
  "threadId",
  "role",
  "kind",
  "text",
  "payloadJson",
  "entityType",
  "entityId",
  "intakeBatchId",
  "source",
  "createdAt",
]);

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

describe("conversation API fixtures", () => {
  it("fixture directory is non-empty", () => {
    const files = readdirSync(fixtureDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it("thread-get shape", () => {
    const body = load("thread-get.json") as { thread: Record<string, unknown> };
    expect(body.thread).toBeDefined();
    for (const key of threadDtoKeys) {
      expect(body.thread).toHaveProperty(key);
    }
    expect(body.thread).not.toHaveProperty("agentStateJson");
  });

  it("thread-create shape", () => {
    const body = load("thread-create.json") as { thread: Record<string, unknown> };
    expect(body.thread).toBeDefined();
    for (const key of threadDtoKeys) {
      expect(body.thread).toHaveProperty(key);
    }
  });

  it("messages-list shape", () => {
    const body = load("messages-list.json") as {
      items: Record<string, unknown>[];
      nextCursor: unknown;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body).toHaveProperty("nextCursor");
    for (const key of messageDtoKeys) {
      expect(body.items[0]).toHaveProperty(key);
    }
  });

  it("message-post shape", () => {
    const body = load("message-post.json") as { message: Record<string, unknown> };
    for (const key of messageDtoKeys) {
      expect(body.message).toHaveProperty(key);
    }
  });
});

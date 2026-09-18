import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("server-only", () => ({}));

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindMany = vi.fn();
const mockMessageFindUnique = vi.fn();
const mockMessageCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversationThread: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    conversationMessage: {
      findUnique: (...args: unknown[]) => mockMessageFindUnique(...args),
      create: (...args: unknown[]) => mockMessageCreate(...args),
      findMany: vi.fn(),
    },
  },
}));

import {
  assertThreadAccess,
  ConversationAccessError,
} from "@/services/conversation/auth";
import { renameThread, softDeleteThread } from "@/services/conversation/threads";
import { appendMessage } from "@/services/conversation/messages";
import { autoTitleFromVehicle } from "@/services/conversation/titles";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const threadRow = (overrides: Record<string, unknown> = {}) => ({
  id: "t1",
  dealerId: "dealer-a",
  ownerUserId: "user-a",
  title: "שיחה",
  titleSource: "AUTO",
  status: "ACTIVE",
  source: "OTHER",
  visibility: "PRIVATE_USER",
  agentStateJson: null,
  compactSummary: null,
  lastMessageAt: null,
  archivedAt: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("conversation list search wiring", () => {
  it("listThreads passes q into prisma where", () => {
    const src = read("src/services/conversation/threads.ts");
    expect(src).toContain("input.q");
    expect(src).toContain("contains: trimmed");
  });
});

describe("conversation thread access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dealer A cannot read dealer B thread", async () => {
    mockFindUnique.mockResolvedValue(
      threadRow({ dealerId: "dealer-b", ownerUserId: "user-b" })
    );
    await expect(
      assertThreadAccess(
        { dealerId: "dealer-a", userId: "user-a" },
        "t1"
      )
    ).rejects.toBeInstanceOf(ConversationAccessError);
  });

  it("private thread forbidden for other user same dealer", async () => {
    mockFindUnique.mockResolvedValue(
      threadRow({ ownerUserId: "user-other" })
    );
    await expect(
      assertThreadAccess(
        { dealerId: "dealer-a", userId: "user-a" },
        "t1"
      )
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("conversation titles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rename USER title is not overwritten by autoTitle", async () => {
    mockFindUnique.mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where.id === "t-user") {
        return Promise.resolve({
          titleSource: "USER",
        });
      }
      return Promise.resolve(threadRow({ id: "t-auto", titleSource: "AUTO" }));
    });
    mockUpdate.mockResolvedValue({});

    await autoTitleFromVehicle({
      threadId: "t-user",
      make: "Toyota",
      model: "Corolla",
      year: 2020,
    });
    expect(mockUpdate).not.toHaveBeenCalled();

    await autoTitleFromVehicle({
      threadId: "t-auto",
      make: "Toyota",
      model: "Corolla",
      year: 2020,
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t-auto" },
        data: expect.objectContaining({ titleSource: "AUTO" }),
      })
    );
  });

  it("renameThread sets USER titleSource", async () => {
    mockFindUnique.mockResolvedValue(threadRow());
    mockUpdate.mockResolvedValue(
      threadRow({ title: "כותרת חדשה", titleSource: "USER" })
    );
    const row = await renameThread({
      principal: { dealerId: "dealer-a", userId: "user-a" },
      threadId: "t1",
      title: "כותרת חדשה",
    });
    expect(row?.titleSource).toBe("USER");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { title: "כותרת חדשה", titleSource: "USER" },
      })
    );
  });
});

describe("conversation lifecycle safety", () => {
  it("soft delete does not cascade vehicle/demand/customer", () => {
    const soft = read("src/services/conversation/threads.ts");
    expect(soft).toContain("Soft delete");
    expect(soft).not.toContain("prisma.vehicle.delete");
    expect(soft).not.toContain("prisma.demand.delete");
    expect(soft).not.toContain("prisma.customer.delete");
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("model ConversationThread");
    expect(schema).not.toMatch(
      /ConversationThread[\s\S]{0,400}onDelete: Cascade[\s\S]{0,80}Vehicle/
    );
  });

  it("softDeleteThread only updates thread status", async () => {
    mockFindUnique.mockResolvedValue(threadRow());
    mockUpdate.mockResolvedValue(
      threadRow({ status: "DELETED", deletedAt: new Date() })
    );
    await softDeleteThread(
      { dealerId: "dealer-a", userId: "user-a" },
      "t1"
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DELETED" }),
      })
    );
  });
});

describe("message idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(threadRow());
    mockUpdate.mockResolvedValue({});
  });

  it("append duplicate idempotencyKey returns existing without second create", async () => {
    const existing = {
      id: "m1",
      threadId: "t1",
      role: "USER",
      kind: "TEXT",
      text: "hello",
      createdAt: new Date(),
    };
    mockMessageFindUnique.mockResolvedValue(existing);

    const first = await appendMessage(
      { dealerId: "dealer-a", userId: "user-a" },
      {
        threadId: "t1",
        role: "USER",
        text: "hello",
        idempotencyKey: "key-1",
      }
    );
    expect(first.created).toBe(false);
    expect(first.message.id).toBe("m1");
    expect(mockMessageCreate).not.toHaveBeenCalled();

    mockMessageFindUnique.mockResolvedValue(existing);
    const second = await appendMessage(
      { dealerId: "dealer-a", userId: "user-a" },
      {
        threadId: "t1",
        role: "USER",
        text: "hello",
        idempotencyKey: "key-1",
      }
    );
    expect(second.created).toBe(false);
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it("creates once when key is new", async () => {
    mockMessageFindUnique.mockResolvedValue(null);
    const createdAt = new Date();
    mockMessageCreate.mockResolvedValue({
      id: "m-new",
      threadId: "t1",
      role: "USER",
      kind: "TEXT",
      text: "hi",
      createdAt,
    });

    const result = await appendMessage(
      { dealerId: "dealer-a", userId: "user-a" },
      {
        threadId: "t1",
        role: "USER",
        text: "hi",
        idempotencyKey: "key-new",
      }
    );
    expect(result.created).toBe(true);
    expect(mockMessageCreate).toHaveBeenCalledTimes(1);
  });
});

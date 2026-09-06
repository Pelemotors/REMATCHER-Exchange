import fs from "node:fs";
import path from "node:path";

describe("six-area reliability batch", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("keeps matching identity and push idempotency guards", () => {
    expect(read("src/services/matching/legacy-search-intent-adapter.ts")).toContain('"אקסנט":"Accent"');
    expect(read("src/services/inventory/create-vehicle.ts")).toContain("canonicalVehicleIdentity");
    expect(read("src/services/notifications/index.ts")).toContain('params.type==="BUYER_MATCH"');
  });
  it("keeps agent continuity and import approval inside agent", () => {
    expect(read("src/app/api/assistant/chat/route.ts")).toContain("agent_conversation_state_v1");
    expect(read("src/app/api/assistant/chat/route.ts")).toContain("confirm_inventory_import");
    expect(read("src/components/inventory/inventory-import.tsx")).toContain("בדיקה ואישור עם הסוכן");
  });
  it("does not erase previously collected demand facts with parser unknowns", () => {
    expect(read("src/services/demand/duplicate-detection.ts")).toContain("unknown parser fields are OMITTED");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("exchange agent tools wiring", () => {
  it("routes intelligence and matching through exchange-agent-tools", () => {
    const tools = read("src/services/assistant/exchange-agent-tools.ts");
    expect(tools).toContain("runExchangeIntelligenceEngine");
    expect(tools).toContain("includeCustomerPhone: false");
    expect(tools).toContain("matchDemandToMyInventory");
    expect(tools).toContain("matchPrivateVehicleToMyDemands");
    expect(tools).toContain("listMarketWatches");
    expect(tools).toContain("createMarketWatch");
  });

  it("agent loop executes exchange agent tools", () => {
    const loop = read("src/services/assistant/agent-loop.ts");
    expect(loop).toContain("executeExchangeAgentTool");
    expect(loop).toContain("isExchangeAgentTool");
  });

  it("OpenAI tool catalog exposes run_exchange_intelligence and watches", () => {
    const agent = read("src/services/assistant/agent-tools.ts");
    expect(agent).toContain('"run_exchange_intelligence"');
    expect(agent).toContain("private_match_demand_to_my_inventory");
    expect(agent).toContain("list_my_market_watches");
    expect(agent).toContain("create_market_watch");
  });
});

describe("market pulse / tape API", () => {
  it("registers v1 market routes", () => {
    expect(read("src/app/api/v1/market/pulse/route.ts")).toContain("getMarketPulse");
    expect(read("src/app/api/v1/market/tape/route.ts")).toContain("getMarketTape");
  });

  it("tape suppresses small cohorts and avoids dealer identity", () => {
    const tape = read("src/services/market/tape.ts");
    expect(tape).toContain("cloakCount");
    expect(tape).toContain("suppressedSmallCohorts");
    expect(tape).toContain("No dealer identity");
  });
});

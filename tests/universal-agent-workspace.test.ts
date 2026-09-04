import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  formatPageContextForAgent,
  pageContextFromPath,
  surfaceFromPath,
} from "@/components/assistant/agent-page-context";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Universal Agent Workspace — page context helpers", () => {
  it("maps inventory/matches/demand surfaces from route", () => {
    expect(surfaceFromPath("/inventory")).toBe("inventory");
    expect(surfaceFromPath("/matches")).toBe("matches");
    expect(surfaceFromPath("/demand")).toBe("demand");
    expect(pageContextFromPath("/inventory").surface).toBe("inventory");
  });

  it("formats compact informational context without intent language", () => {
    const block = formatPageContextForAgent({
      surface: "matches",
      route: "/matches",
      selectedEntityType: "match",
      selectedEntityId: "m1",
      selectedEntityLabel: "CX-5",
    });
    expect(block).toContain("surface=matches");
    expect(block).toContain("selectedEntity=match:m1");
    expect(block.toLowerCase()).not.toContain("forcedintent");
    expect(block.toLowerCase()).not.toContain("intent=");
  });

  it("navigation context change does not imply conversation wipe API", () => {
    const provider = read(
      "src/components/assistant/agent-workspace-provider.tsx"
    );
    expect(provider).toContain("never reset conversation");
    expect(provider).toContain("setPresentationMode");
    expect(provider).not.toMatch(
      /pathname[\s\S]{0,80}setMessages\(\[\]\)/
    );
  });
});

describe("Universal Agent Workspace — presentation architecture", () => {
  it("FAB opens companion on mobile; expand/collapse preserve conversation state APIs", () => {
    const provider = read(
      "src/components/assistant/agent-workspace-provider.tsx"
    );
    const ui = read("src/components/assistant/agent-workspace.tsx");
    expect(provider).toContain('"companion"');
    expect(provider).toContain('"focus"');
    expect(provider).toContain("expandToFocus");
    expect(provider).toContain("collapseToCompanion");
    expect(provider).toContain("toggleFab");
    expect(ui).toContain('aria-label="הרחב"');
    expect(ui).toContain('aria-label="הקטן"');
    expect(ui).toContain("REMATCHER Agent");
  });

  it("mobile companion is partial sheet; focus is near-fullscreen; desktop is side panel", () => {
    const css = read("src/components/assistant/agent-workspace.module.css");
    expect(css).toContain("52dvh");
    expect(css).toMatch(/\.focus[\s\S]*100dvh/);
    expect(css).toMatch(/\.desktop[\s\S]*100dvh/);
    expect(css).toMatch(/\.desktop[\s\S]*inset-inline-end:\s*0/);
  });

  it("desktop does not use modal BottomSheet for agent panel", () => {
    const ui = read("src/components/assistant/agent-workspace.tsx");
    expect(ui).not.toContain("BottomSheet");
    expect(ui).toContain('variant="desktop"');
  });

  it("AppShell hides bottom nav only in focus mode", () => {
    const shell = read("src/components/layout/app-shell-v2.tsx");
    const css = read("src/components/layout/app-shell-v2.module.css");
    expect(shell).toContain("hideMobileNav");
    expect(shell).toContain("AgentWorkspaceProvider");
    expect(css).toContain("mobileNavHidden");
  });

  it("close does not clear conversation state in provider", () => {
    const provider = read(
      "src/components/assistant/agent-workspace-provider.tsx"
    );
    const closeBlock = provider.slice(
      provider.indexOf("const closeAgent"),
      provider.indexOf("const expandToFocus")
    );
    expect(closeBlock).toContain('setPresentationMode("closed")');
    expect(closeBlock).not.toContain("setMessages");
    expect(closeBlock).not.toContain("setConversation");
  });
});

describe("Universal Agent Workspace — inventory integration", () => {
  it("inventory page opens universal agent CTA without inline chat history", () => {
    const page = read("src/app/(dealer)/inventory/page.tsx");
    const workspace = read(
      "src/components/inventory/inventory-agent-workspace.tsx"
    );
    expect(page).toContain("דבר עם ה-Agent");
    expect(page).toContain('mode: "inventory_management"');
    expect(page).toContain('surface: "inventory"');
    expect(workspace).toContain("דבר עם ה-Agent");
    expect(workspace).toContain("העלאת קובץ");
    expect(workspace).toContain("InventoryImportPanel");
    expect(workspace).toContain("openAgent");
    expect(workspace).not.toContain("שלח לסוכן");
    expect(workspace).not.toContain("recentTurns");
    expect(workspace).not.toContain('role: "user"');
  });

  it("inventory and global agent share the same assistant chat endpoint", () => {
    const provider = read(
      "src/components/assistant/agent-workspace-provider.tsx"
    );
    const workspace = read(
      "src/components/inventory/inventory-agent-workspace.tsx"
    );
    expect(provider).toContain('"/api/assistant/chat"');
    expect(workspace).not.toContain("/api/assistant/chat");
  });

  it("matches/demand report page surfaces", () => {
    expect(read("src/app/(dealer)/matches/page.tsx")).toContain(
      'surface: "matches"'
    );
    expect(read("src/app/(dealer)/demand/page.tsx")).toContain(
      'surface: "demand"'
    );
  });
});

describe("Universal Agent Workspace — conversation CTA / errors / context guardrails", () => {
  it("CTA actions only come from requiresConfirmation mapping", () => {
    const provider = read(
      "src/components/assistant/agent-workspace-provider.tsx"
    );
    const ui = read("src/components/assistant/agent-workspace.tsx");
    expect(provider).toContain("confirmationActions");
    expect(provider).toContain("data.requiresConfirmation");
    expect(ui).toContain("msg.actions");
    expect(provider).not.toMatch(/if\s*\(.*includes\(["']המשך/);
  });

  it("errors keep conversation and do not close agent", () => {
    const provider = read(
      "src/components/assistant/agent-workspace-provider.tsx"
    );
    expect(provider).toContain("לא הצלחתי להשלים את הבקשה כרגע");
    expect(provider).not.toMatch(
      /catch\s*\{[\s\S]{0,200}setPresentationMode\("closed"\)/
    );
    expect(provider).not.toMatch(
      /catch\s*\{[\s\S]{0,200}setConversation\(\{\}\)/
    );
  });

  it("page context is attached without forcedIntent from surface alone", () => {
    const provider = read(
      "src/components/assistant/agent-workspace-provider.tsx"
    );
    expect(provider).toContain("surface: page.surface");
    expect(provider).toContain(
      "Only when session already in inventory_management"
    );
    // No regex keyword router for Hebrew page intents
    expect(provider).not.toMatch(/מה חסר.*inventory/);
    expect(provider).not.toMatch(/למה מתאים.*match/);
  });

  it("ExchangeAssistant remains the AppShell entry for one agent", () => {
    const shell = read("src/components/layout/app-shell-v2.tsx");
    const entry = read("src/components/assistant/exchange-assistant.tsx");
    expect(shell).toContain("ExchangeAssistant");
    expect(entry).toContain("AgentWorkspace");
    expect(entry).toContain("export function ExchangeAssistant");
  });
});

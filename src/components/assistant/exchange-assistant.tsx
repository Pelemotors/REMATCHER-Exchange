"use client";

/**
 * Compatibility entry — Universal Agent Workspace.
 * Keep export names used by AppShell / events.
 */
export {
  AgentWorkspaceProvider,
  useAgentWorkspace,
  useSetAgentPageContext,
  OPEN_ASSISTANT_EVENT,
  type OpenAssistantDetail,
} from "@/components/assistant/agent-workspace-provider";
export { AgentWorkspace } from "@/components/assistant/agent-workspace";

import { AgentWorkspace } from "@/components/assistant/agent-workspace";

/** @deprecated Use AgentWorkspace — kept for AppShell dynamic import. */
export function ExchangeAssistant() {
  return <AgentWorkspace />;
}

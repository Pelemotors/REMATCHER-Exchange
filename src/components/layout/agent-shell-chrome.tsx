"use client";

import { useAgentWorkspaceOptional } from "@/components/assistant/agent-workspace-provider";

/** Hides mobile bottom nav in Focus mode; signals desktop dock via data attrs. */
export function useAgentShellFlags() {
  const agent = useAgentWorkspaceOptional();
  const focus =
    agent?.presentationMode === "focus" && !agent?.isDesktop;
  const desktopOpen =
    Boolean(agent?.isDesktop) && agent?.presentationMode !== "closed";
  return { hideMobileNav: focus, desktopAgentOpen: desktopOpen };
}

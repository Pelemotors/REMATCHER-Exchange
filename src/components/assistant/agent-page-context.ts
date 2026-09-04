/**
 * Page context for the Universal Agent Workspace.
 * Informational soft context for the AI — not an intent router / forced scope.
 */

export type AgentSurface =
  | "home"
  | "inventory"
  | "demand"
  | "matches"
  | "opportunities"
  | "activity"
  | "account"
  | "validations"
  | "other";

export type AgentEntityType = "vehicle" | "demand" | "match" | "search";

export type AgentPageContext = {
  surface: AgentSurface;
  route: string;
  selectedEntityType?: AgentEntityType;
  selectedEntityId?: string;
  selectedEntityLabel?: string;
};

export function surfaceFromPath(pathname: string | null | undefined): AgentSurface {
  if (!pathname) return "other";
  if (pathname.startsWith("/inventory")) return "inventory";
  if (pathname.startsWith("/demand")) return "demand";
  if (pathname.startsWith("/matches")) return "matches";
  if (pathname.startsWith("/opportunities")) return "opportunities";
  if (pathname.startsWith("/activity")) return "activity";
  if (pathname.startsWith("/account")) return "account";
  if (pathname.startsWith("/validations")) return "validations";
  if (pathname.startsWith("/home")) return "home";
  return "other";
}

export function pageContextFromPath(
  pathname: string | null | undefined
): AgentPageContext {
  const route = pathname || "/";
  return { surface: surfaceFromPath(pathname), route };
}

/** Compact string for Agent system CONTEXT block — informational only. */
export function formatPageContextForAgent(
  page?: AgentPageContext | null
): string {
  if (!page) return "";
  const parts = [
    `surface=${page.surface}`,
    `route=${page.route}`,
  ];
  if (page.selectedEntityType && page.selectedEntityId) {
    parts.push(
      `selectedEntity=${page.selectedEntityType}:${page.selectedEntityId}`
    );
  }
  if (page.selectedEntityLabel) {
    parts.push(`selectedEntityLabel=${page.selectedEntityLabel.slice(0, 80)}`);
  }
  return parts.join("\n");
}

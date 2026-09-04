"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { ConversationState } from "@/services/assistant/conversation-state";
import {
  pageContextFromPath,
  type AgentPageContext,
} from "@/components/assistant/agent-page-context";

export type AgentPresentationMode = "closed" | "companion" | "focus";

export type AgentSuggestion = { label: string; href?: string };

export type AgentCard = {
  type: string;
  title: string;
  body?: string;
  href?: string;
  demandId?: string;
};

export type AgentMessage = {
  role: "user" | "assistant";
  text: string;
  suggestions?: AgentSuggestion[];
  cards?: AgentCard[];
  /** Structured confirmation CTAs from backend only */
  actions?: Array<{ label: string; sendText: string }>;
};

export type PendingConfirmation = {
  action: string;
  label: string;
  payload: Record<string, unknown>;
};

export type OpenAgentOptions = {
  mode?: "create_inventory" | "create_demand" | "inventory_management";
  presentation?: AgentPresentationMode;
  seedMessage?: string;
  vehicleId?: string;
  demandId?: string;
  matchId?: string;
  /** Prefer focus on mobile when opening from explicit inventory CTA */
  preferFocusOnMobile?: boolean;
};

export const OPEN_ASSISTANT_EVENT = "rematcher:open-assistant";

export type OpenAssistantDetail = OpenAgentOptions;

type AgentWorkspaceContextValue = {
  presentationMode: AgentPresentationMode;
  pageContext: AgentPageContext;
  messages: AgentMessage[];
  conversation: ConversationState;
  pendingConfirmation: PendingConfirmation | null;
  loading: boolean;
  error: string | null;
  isDesktop: boolean;
  openAgent: (opts?: OpenAgentOptions) => void;
  closeAgent: () => void;
  expandToFocus: () => void;
  collapseToCompanion: () => void;
  toggleFab: () => void;
  send: (text: string, conversationOverride?: ConversationState) => Promise<void>;
  setPageContext: (ctx: Partial<AgentPageContext> | null) => void;
  clearError: () => void;
};

const AgentWorkspaceContext = createContext<AgentWorkspaceContextValue | null>(
  null
);

function routeBootstrap(pathname: string | null): {
  text: string;
  suggestions: AgentSuggestion[];
} {
  if (pathname?.startsWith("/inventory")) {
    return {
      text: "אפשר להוסיף רכב, לעדכן מחיר, לבדוק מה דורש טיפול, או לשאול על רכב קיים.",
      suggestions: [
        { label: "הוסף רכב" },
        { label: "מה דורש טיפול?" },
        { label: "איזה רכב שלי מעניין סוחרים?" },
      ],
    };
  }
  if (pathname?.startsWith("/demand")) {
    return {
      text: "אפשר לפתוח חיפוש, לשנות חיפוש, או לבדוק מה התקדם.",
      suggestions: [
        { label: "פתח חיפוש" },
        { label: "מה התקדם בחיפושים שלי?" },
        { label: "איזה חיפוש עומד להסתיים?" },
      ],
    };
  }
  if (
    pathname?.startsWith("/matches") ||
    pathname?.startsWith("/opportunities")
  ) {
    return {
      text: "אפשר לסכם מה הכי רלוונטי, להסביר פערים, או לפתוח התאמה שדורשת פעולה.",
      suggestions: [
        { label: "מה הכי חזק כרגע?" },
        { label: "למה זו התאמה?" },
        { label: "איזה דורש ממני פעולה?" },
      ],
    };
  }
  if (pathname?.startsWith("/activity")) {
    return {
      text: "אפשר לסכם מה דורש פעולה ומה קרה לאחרונה.",
      suggestions: [
        { label: "מה דורש פעולה?" },
        { label: "מה קרה היום?" },
      ],
    };
  }
  return {
    text: "מה כדאי לטפל בו עכשיו?",
    suggestions: [{ label: "מה כדאי לטפל בו עכשיו?" }],
  };
}

function confirmationActions(
  pending: PendingConfirmation | null
): Array<{ label: string; sendText: string }> | undefined {
  if (!pending) return undefined;
  if (pending.action === "mark_sold") {
    return [
      { label: "כן, נמכרה", sendText: "כן" },
      { label: "ביטול", sendText: "לא" },
    ];
  }
  if (pending.action === "update_inventory") {
    return [
      { label: "עדכן", sendText: "כן" },
      { label: "ביטול", sendText: "לא" },
    ];
  }
  return [
    { label: pending.label || "אשר", sendText: "כן" },
    { label: "ביטול", sendText: "לא" },
  ];
}

function useMediaDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return isDesktop;
}

export function AgentWorkspaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDesktop = useMediaDesktop();

  const [presentationMode, setPresentationMode] =
    useState<AgentPresentationMode>("closed");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationState>({});
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageOverride, setPageOverride] = useState<Partial<AgentPageContext> | null>(
    null
  );

  const conversationRef = useRef<ConversationState>({});
  const messagesRef = useRef<AgentMessage[]>([]);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const pageContext = useMemo<AgentPageContext>(() => {
    const base = pageContextFromPath(pathname);
    if (!pageOverride) return base;
    return {
      ...base,
      ...pageOverride,
      route: pageOverride.route ?? base.route,
      surface: pageOverride.surface ?? base.surface,
    };
  }, [pathname, pageOverride]);

  const pageContextRef = useRef(pageContext);
  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);

  // Route changes update soft page context; never reset conversation.
  useEffect(() => {
    setPageOverride((prev) => {
      if (!prev) return null;
      // Keep entity override only if still on a compatible surface path
      return {
        ...prev,
        route: pathname || prev.route,
        surface: pageContextFromPath(pathname).surface,
      };
    });
  }, [pathname]);

  const ensureBootstrap = useCallback(async () => {
    if (messagesRef.current.length > 0) return;
    const bootstrap = routeBootstrap(pathnameRef.current);
    let suggestions = bootstrap.suggestions;
    try {
      const res = await fetch("/api/assistant/context");
      if (res.ok) {
        const data = await res.json();
        if (
          (!pathnameRef.current || pathnameRef.current.startsWith("/home")) &&
          data.suggestions?.length
        ) {
          suggestions = data.suggestions;
        }
      }
    } catch {
      /* route defaults */
    }
    setMessages([
      {
        role: "assistant",
        text: bootstrap.text,
        suggestions,
      },
    ]);
  }, []);

  const openAgent = useCallback(
    (opts: OpenAgentOptions = {}) => {
      const preferFocus =
        opts.preferFocusOnMobile ||
        opts.mode === "inventory_management" ||
        opts.presentation === "focus";
      const nextMode: AgentPresentationMode = isDesktop
        ? "companion"
        : opts.presentation === "companion"
          ? "companion"
          : preferFocus
            ? "focus"
            : "companion";

      if (opts.mode === "create_inventory" && !opts.vehicleId) {
        const seeded: ConversationState = {
          sessionContext: { forcedIntent: "create_inventory" },
        };
        setConversation(seeded);
        conversationRef.current = seeded;
        setPendingConfirmation(null);
        setError(null);
        setMessages([
          {
            role: "assistant",
            text: "שלח את פרטי הרכב בטקסט חופשי (לדוגמה: טויוטה קורולה 2022 62 אלף 139000).",
            suggestions: [{ label: "הוסף רכב" }],
          },
        ]);
        setPresentationMode(nextMode);
        return;
      }

      if (opts.mode === "inventory_management") {
        const seeded: ConversationState = {
          ...conversationRef.current,
          sessionContext: {
            ...conversationRef.current.sessionContext,
            operatingMode: "inventory_management",
          },
          focusedObject: opts.vehicleId
            ? { type: "vehicle", id: opts.vehicleId }
            : conversationRef.current.focusedObject,
        };
        setConversation(seeded);
        conversationRef.current = seeded;
        setPageOverride({
          surface: "inventory",
          route: "/inventory",
          selectedEntityType: opts.vehicleId ? "vehicle" : undefined,
          selectedEntityId: opts.vehicleId,
        });
        if (messagesRef.current.length === 0) {
          setMessages([
            {
              role: "assistant",
              text: "כתוב לי את הרכבים כמו שנוח לך. אפשר אחד אחד, כמה יחד, לעדכן רכב קיים או לסמן רכב שנמכר.",
              suggestions: [
                { label: "הוסף רכב" },
                { label: "בדוק מה דורש טיפול" },
                { label: "יש לי שאלה" },
              ],
            },
          ]);
        }
        setPresentationMode(nextMode);
        if (opts.seedMessage) {
          // seed after open — handled by caller via send after paint
        }
        return;
      }

      if (opts.vehicleId || opts.demandId || opts.matchId) {
        const seeded: ConversationState = {
          ...(opts.mode === "create_inventory"
            ? { sessionContext: { forcedIntent: "create_inventory" as const } }
            : conversationRef.current),
          focusedObject: opts.vehicleId
            ? { type: "vehicle", id: opts.vehicleId }
            : opts.demandId
              ? { type: "demand", id: opts.demandId }
              : opts.matchId
                ? { type: "match", id: opts.matchId }
                : conversationRef.current.focusedObject,
        };
        setConversation(seeded);
        conversationRef.current = seeded;
        setPendingConfirmation(null);
        const bootstrap = routeBootstrap(pathnameRef.current);
        if (messagesRef.current.length === 0) {
          setMessages([
            {
              role: "assistant",
              text: opts.vehicleId
                ? "שאל אותי על הרכב הזה — מה קורה איתו, יש עניין, או מה לעדכן."
                : opts.demandId
                  ? "שאל אותי על החיפוש הזה — מה התקדם ומה דורש פעולה."
                  : opts.matchId
                    ? "שאל אותי על ההתאמה הזו — למה היא טובה ומה הצעד הבא."
                    : bootstrap.text,
              suggestions: bootstrap.suggestions,
            },
          ]);
        }
        setPresentationMode(nextMode);
        return;
      }

      void ensureBootstrap();
      setPresentationMode(nextMode);
    },
    [ensureBootstrap, isDesktop]
  );

  const closeAgent = useCallback(() => {
    setPresentationMode("closed");
  }, []);

  const expandToFocus = useCallback(() => {
    setPresentationMode("focus");
  }, []);

  const collapseToCompanion = useCallback(() => {
    setPresentationMode(isDesktop ? "companion" : "companion");
  }, [isDesktop]);

  const toggleFab = useCallback(() => {
    if (presentationMode === "closed") {
      openAgent({ presentation: "companion" });
      return;
    }
    if (presentationMode === "focus") {
      setPresentationMode("companion");
      return;
    }
    setPresentationMode("closed");
  }, [openAgent, presentationMode]);

  const send = useCallback(
    async (text: string, conversationOverride?: ConversationState) => {
      if (!text.trim() || loading) return;
      setError(null);
      setMessages((m) => [...m, { role: "user", text }]);
      setLoading(true);

      const conv = conversationOverride ?? conversationRef.current;
      const page = pageContextRef.current;
      // Only when session already in inventory_management — never force from route alone.
      const inventoryMode =
        conv.sessionContext?.operatingMode === "inventory_management";

      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            context: {
              route: page.route || pathnameRef.current || "/",
              surface: page.surface,
              entityType:
                page.selectedEntityType === "search"
                  ? "demand"
                  : page.selectedEntityType ?? conv.focusedObject?.type,
              entityId: page.selectedEntityId ?? conv.focusedObject?.id,
              entityLabel: page.selectedEntityLabel,
              mode: inventoryMode ? "inventory_management" : undefined,
              vehicleId:
                conv.focusedObject?.type === "vehicle"
                  ? conv.focusedObject.id
                  : undefined,
              demandId:
                conv.focusedObject?.type === "demand"
                  ? conv.focusedObject.id
                  : undefined,
              matchId:
                conv.focusedObject?.type === "match"
                  ? conv.focusedObject.id
                  : undefined,
            },
            conversation: conv,
          }),
        });

        const data = await res.json().catch(() => ({}));
        setLoading(false);

        if (!res.ok) {
          const errText =
            "לא הצלחתי להשלים את הבקשה כרגע. נסה שוב.";
          setError(errText);
          setMessages((m) => [
            ...m,
            { role: "assistant", text: errText },
          ]);
          return;
        }

        if (data.conversation) {
          setConversation(data.conversation);
          conversationRef.current = data.conversation;
        }

        const pending = data.requiresConfirmation ?? null;
        setPendingConfirmation(pending);

        const actions = confirmationActions(pending);

        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: data.message ?? "לא הצלחתי לעבד את הבקשה.",
            suggestions: data.suggestions,
            cards: data.cards,
            actions,
          },
        ]);
      } catch {
        setLoading(false);
        const errText =
          "לא הצלחתי להשלים את הבקשה כרגע. נסה שוב.";
        setError(errText);
        setMessages((m) => [...m, { role: "assistant", text: errText }]);
      }
    },
    [loading]
  );

  const setPageContext = useCallback(
    (ctx: Partial<AgentPageContext> | null) => {
      setPageOverride(ctx);
    },
    []
  );

  // Global open event — same Universal Agent
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenAssistantDetail>).detail ?? {};
      if (detail.mode === "create_inventory" && !detail.vehicleId) {
        openAgent({
          mode: "create_inventory",
          preferFocusOnMobile: true,
          ...detail,
        });
        return;
      }
      openAgent(detail);
      if (detail.seedMessage) {
        window.setTimeout(() => {
          void send(detail.seedMessage!, conversationRef.current);
        }, 0);
      }
    }
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, [openAgent, send]);

  // Sync body class for CSS (focus / desktop dock)
  useEffect(() => {
    document.documentElement.dataset.agentMode = presentationMode;
    document.documentElement.dataset.agentDesktop = isDesktop ? "1" : "0";
    return () => {
      delete document.documentElement.dataset.agentMode;
      delete document.documentElement.dataset.agentDesktop;
    };
  }, [presentationMode, isDesktop]);

  const value = useMemo<AgentWorkspaceContextValue>(
    () => ({
      presentationMode,
      pageContext,
      messages,
      conversation,
      pendingConfirmation,
      loading,
      error,
      isDesktop,
      openAgent,
      closeAgent,
      expandToFocus,
      collapseToCompanion,
      toggleFab,
      send,
      setPageContext,
      clearError: () => setError(null),
    }),
    [
      presentationMode,
      pageContext,
      messages,
      conversation,
      pendingConfirmation,
      loading,
      error,
      isDesktop,
      openAgent,
      closeAgent,
      expandToFocus,
      collapseToCompanion,
      toggleFab,
      send,
      setPageContext,
    ]
  );

  return (
    <AgentWorkspaceContext.Provider value={value}>
      {children}
    </AgentWorkspaceContext.Provider>
  );
}

export function useAgentWorkspace() {
  const ctx = useContext(AgentWorkspaceContext);
  if (!ctx) {
    throw new Error("useAgentWorkspace must be used within AgentWorkspaceProvider");
  }
  return ctx;
}

/** Optional hook for pages — no throw when provider missing (SSR safety). */
export function useAgentWorkspaceOptional() {
  return useContext(AgentWorkspaceContext);
}

export function useSetAgentPageContext(
  ctx: Partial<AgentPageContext> | null,
  deps: unknown[] = []
) {
  const agent = useAgentWorkspaceOptional();
  useEffect(() => {
    if (!agent) return;
    agent.setPageContext(ctx);
    return () => {
      agent.setPageContext(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, ...deps]);
}

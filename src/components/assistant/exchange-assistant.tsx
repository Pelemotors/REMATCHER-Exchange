"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ButtonV2 } from "@/components/ui/brand-v2";
import type { ConversationState } from "@/services/assistant/conversation-state";
import styles from "./exchange-assistant.module.css";

interface Suggestion {
  label: string;
  href?: string;
}

interface AssistantCard {
  type: string;
  title: string;
  body?: string;
  href?: string;
  demandId?: string;
}

interface Message {
  role: "user" | "assistant";
  text: string;
  suggestions?: Suggestion[];
  cards?: AssistantCard[];
}

interface PendingConfirmation {
  action: string;
  label: string;
  payload: Record<string, unknown>;
}

export const OPEN_ASSISTANT_EVENT = "rematcher:open-assistant";

export type OpenAssistantDetail = {
  mode?: "create_inventory" | "create_demand";
  seedMessage?: string;
  vehicleId?: string;
  demandId?: string;
  matchId?: string;
};

function routeAssistantBootstrap(pathname: string | null): {
  text: string;
  suggestions: Suggestion[];
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
  if (pathname?.startsWith("/matches") || pathname?.startsWith("/opportunities")) {
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

export function ExchangeAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<ConversationState>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const conversationRef = useRef<ConversationState>({});

  const send = useCallback(
    async (text: string, conversationOverride?: ConversationState) => {
      if (!text.trim() || loading) return;

      setMessages((m) => [...m, { role: "user", text }]);
      setInput("");
      setLoading(true);

      const conv = conversationOverride ?? conversationRef.current;

      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          context: {
            route: pathname,
            vehicleId: conv.focusedObject?.type === "vehicle" ? conv.focusedObject.id : undefined,
            demandId: conv.focusedObject?.type === "demand" ? conv.focusedObject.id : undefined,
            matchId: conv.focusedObject?.type === "match" ? conv.focusedObject.id : undefined,
          },
          conversation: conv,
        }),
      });
      const data = await res.json();
      setLoading(false);

      if (data.conversation) {
        setConversation(data.conversation);
        conversationRef.current = data.conversation;
      }

      if (data.requiresConfirmation) {
        setPendingConfirmation(data.requiresConfirmation);
      } else {
        setPendingConfirmation(null);
      }

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.message ?? "לא הצלחתי לעבד את הבקשה.",
          suggestions: data.suggestions,
          cards: data.cards,
        },
      ]);
    },
    [loading, pathname]
  );

  const openInCreateInventoryMode = useCallback(() => {
    const seeded: ConversationState = {
      sessionContext: { forcedIntent: "create_inventory" },
    };
    setConversation(seeded);
    conversationRef.current = seeded;
    setPendingConfirmation(null);
    setMessages([
      {
        role: "assistant",
        text: "שלח את פרטי הרכב בטקסט חופשי (לדוגמה: טויוטה קורולה 2022 62 אלף 139000).",
        suggestions: [{ label: "הוסף רכב" }],
      },
    ]);
    setOpen(true);
  }, []);

  const openWithObjectContext = useCallback(
    (detail: OpenAssistantDetail) => {
      const seeded: ConversationState = {
        ...(detail.mode === "create_inventory"
          ? { sessionContext: { forcedIntent: "create_inventory" as const } }
          : {}),
        focusedObject: detail.vehicleId
          ? { type: "vehicle", id: detail.vehicleId }
          : detail.demandId
            ? { type: "demand", id: detail.demandId }
            : detail.matchId
              ? { type: "match", id: detail.matchId }
              : undefined,
      } as ConversationState;
      setConversation(seeded);
      conversationRef.current = seeded;
      setPendingConfirmation(null);
      const bootstrap = routeAssistantBootstrap(pathname);
      setMessages([
        {
          role: "assistant",
          text: detail.vehicleId
            ? "שאל אותי על הרכב הזה — מה קורה איתו, יש עניין, או מה לעדכן."
            : detail.demandId
              ? "שאל אותי על החיפוש הזה — מה התקדם ומה דורש פעולה."
              : detail.matchId
                ? "שאל אותי על ההתאמה הזו — למה היא טובה ומה הצעד הבא."
                : bootstrap.text,
          suggestions: bootstrap.suggestions,
        },
      ]);
      setOpen(true);
      if (detail.seedMessage) {
        void send(detail.seedMessage, seeded);
      }
    },
    [pathname, send]
  );

  async function openAssistant() {
    setOpen(true);
    if (messages.length === 0) {
      const bootstrap = routeAssistantBootstrap(pathname);
      let suggestions = bootstrap.suggestions;
      try {
        const res = await fetch("/api/assistant/context");
        if (res.ok) {
          const data = await res.json();
          // Prefer route-aware chips; merge server suggestions if route is generic home
          if (
            (!pathname || pathname.startsWith("/home")) &&
            data.suggestions?.length
          ) {
            suggestions = data.suggestions;
          }
        }
      } catch {
        /* use route defaults */
      }
      setMessages([
        {
          role: "assistant",
          text: bootstrap.text,
          suggestions,
        },
      ]);
    }
  }

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenAssistantDetail>).detail ?? {};
      if (detail.mode === "create_inventory" && !detail.vehicleId) {
        openInCreateInventoryMode();
        return;
      }
      if (detail.vehicleId || detail.demandId || detail.matchId || detail.mode) {
        openWithObjectContext(detail);
        return;
      }
      void openAssistant();
    }
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, [openInCreateInventoryMode, openWithObjectContext]);

  return (
    <>
      <button
        type="button"
        onClick={openAssistant}
        className={styles.fab}
        aria-label="Exchange Assistant"
      >
        <MessageSquare className={styles.fabIcon} strokeWidth={1.75} size={20} />
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Exchange Assistant"
        subtitle="פעילות שלך ב-Exchange בלבד"
        desktopWidth="md:w-[400px]"
        className="md:h-full"
        footer={
          <div className="space-y-2">
            {pendingConfirmation && (
              <div className={styles.confirmRow}>
                <ButtonV2
                  variant="signal"
                  className="flex-1"
                  onClick={() => send("כן")}
                >
                  אשר
                </ButtonV2>
                <ButtonV2
                  variant="secondary"
                  className="flex-1"
                  onClick={() => send("לא")}
                >
                  בטל
                </ButtonV2>
              </div>
            )}
            <form
              className={styles.composer}
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <input
                className={styles.input}
                placeholder="שאל על החיפושים או הפעילות שלך..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                type="submit"
                className={styles.sendBtn}
                disabled={loading}
                aria-label="שלח"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        }
      >
        <div className={styles.messages}>
          {messages.map((msg, i) => (
            <div key={i}>
              <div
                className={
                  msg.role === "user"
                    ? styles.bubbleUser
                    : styles.bubbleAssistant
                }
              >
                {msg.text}
              </div>

              {msg.cards && msg.cards.length > 0 && (
                <div className="mt-2 space-y-2">
                  {msg.cards.map((card, j) => (
                    <div key={j} className={styles.card}>
                      <p className={styles.cardTitle}>{card.title}</p>
                      {card.body && (
                        <p className={styles.cardBody}>{card.body}</p>
                      )}
                      {card.href && (
                        <Link
                          href={card.href}
                          className={styles.cardLink}
                          onClick={() => setOpen(false)}
                        >
                          פתח
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {msg.suggestions && (
                <div className={styles.chips}>
                  {msg.suggestions.map((s) =>
                    s.href ? (
                      <Link
                        key={s.label}
                        href={s.href}
                        className={styles.chip}
                        onClick={() => setOpen(false)}
                      >
                        {s.label}
                      </Link>
                    ) : (
                      <button
                        key={s.label}
                        type="button"
                        className={styles.chip}
                        onClick={() => {
                          if (
                            s.label === "הוסף רכב" ||
                            s.label.includes("הוסף רכב")
                          ) {
                            openInCreateInventoryMode();
                            return;
                          }
                          send(s.label);
                        }}
                      >
                        {s.label}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <p className={styles.loading}>בודק את המצב שלך...</p>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

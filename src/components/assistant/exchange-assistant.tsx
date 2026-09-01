"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { ConversationState } from "@/services/assistant/conversation-state";

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

  async function openAssistant() {
    setOpen(true);
    if (messages.length === 0) {
      let suggestions: Suggestion[] = [{ label: "מה כדאי לטפל בו עכשיו?" }];
      try {
        const res = await fetch("/api/assistant/context");
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions?.length) suggestions = data.suggestions;
        }
      } catch {
        /* use default */
      }
      setMessages([
        {
          role: "assistant",
          text: "מה כדאי לטפל בו עכשיו?",
          suggestions,
        },
      ]);
    }
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);

    const res = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        context: { route: pathname },
        conversation: conversationRef.current,
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
  }

  return (
    <>
      <button
        type="button"
        onClick={openAssistant}
        className="fixed bottom-20 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface shadow-elevated hover:border-signal md:bottom-6 md:left-6"
        aria-label="Exchange Assistant"
      >
        <MessageSquare className="h-5 w-5 text-signal" strokeWidth={1.75} />
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
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  onClick={() => send("כן")}
                >
                  אשר
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => send("לא")}
                >
                  בטל
                </button>
              </div>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <input
                className="input flex-1"
                placeholder="שאל על החיפושים או הפעילות שלך..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                type="submit"
                className="btn-primary px-3"
                disabled={loading}
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        }
      >
        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div key={i}>
              <div
                className={cn(
                  "max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  msg.role === "user"
                    ? "mr-auto bg-signal text-white"
                    : "ml-auto bg-surface-secondary"
                )}
              >
                {msg.text}
              </div>

              {msg.cards && msg.cards.length > 0 && (
                <div className="mt-2 space-y-2">
                  {msg.cards.map((card, j) => (
                    <div key={j} className="card text-sm">
                      <p className="font-medium">{card.title}</p>
                      {card.body && (
                        <p className="text-text-secondary">{card.body}</p>
                      )}
                      {card.href && (
                        <Link
                          href={card.href}
                          className="mt-2 inline-block text-xs text-signal"
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {msg.suggestions.map((s) =>
                    s.href ? (
                      <Link
                        key={s.label}
                        href={s.href}
                        className="rounded-full border px-2 py-0.5 text-xs"
                        onClick={() => setOpen(false)}
                      >
                        {s.label}
                      </Link>
                    ) : (
                      <button
                        key={s.label}
                        type="button"
                        className="rounded-full border px-2 py-0.5 text-xs"
                        onClick={() => send(s.label)}
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
            <p className="text-sm text-text-muted">בודק את המצב שלך...</p>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MessageSquare, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  text: string;
  suggestions?: Array<{ label: string; href?: string }>;
}

export function ExchangeAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Exchange Assistant — איך אוכל לעזור עם החיפושים והפעילות שלך?",
      suggestions: [
        { label: "מה אני מחפש?" },
        { label: "מה מחכה לי?" },
        { label: "פתח חיפוש", href: "/demand?new=1" },
      ],
    },
  ]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function send(text: string) {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    const res = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, context: { route: pathname } }),
    });
    const data = await res.json();
    setLoading(false);
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        text: data.message ?? "לא הצלחתי לעבד את הבקשה.",
        suggestions: data.suggestions,
      },
    ]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface shadow-elevated hover:border-signal md:bottom-6 md:left-6"
        aria-label="Exchange Assistant"
      >
        <MessageSquare className="h-5 w-5 text-signal" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-midnight/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex h-[85vh] flex-col rounded-t-xl bg-surface shadow-modal md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[400px] md:rounded-none md:rounded-l-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="font-semibold">Exchange Assistant</p>
                <p className="text-xs text-text-muted">פעילות שלך ב-Exchange בלבד</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    msg.role === "user"
                      ? "mr-auto bg-signal text-white"
                      : "ml-auto bg-surface-secondary"
                  )}
                >
                  {msg.text}
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
              {loading && <p className="text-sm text-text-muted">חושב...</p>}
            </div>
            <form
              className="flex gap-2 border-t p-4"
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
              <button type="submit" className="btn-primary px-3" disabled={loading}>
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Maximize2,
  MessageSquare,
  Minimize2,
  Send,
  X,
} from "lucide-react";
import { ButtonV2 } from "@/components/ui/brand-v2";
import {
  useAgentWorkspace,
  type AgentMessage,
} from "@/components/assistant/agent-workspace-provider";
import { cn } from "@/lib/utils";
import styles from "./agent-workspace.module.css";

function ConversationList({
  messages,
  loading,
  error,
  onSend,
  onNavigate,
}: {
  messages: AgentMessage[];
  loading: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onNavigate: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onScroll() {
      if (!el) return;
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = dist < 80;
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  return (
    <div className={styles.messages} ref={scrollerRef} role="log" aria-live="polite">
      {messages.map((msg, i) => (
        <div key={i}>
          <div
            className={
              msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant
            }
          >
            {msg.text}
          </div>

          {msg.cards && msg.cards.length > 0 && (
            <div className="mt-2 space-y-2">
              {msg.cards.map((card, j) => (
                <div key={j} className={styles.card}>
                  <p className={styles.cardTitle}>{card.title}</p>
                  {card.body && <p className={styles.cardBody}>{card.body}</p>}
                  {card.href && (
                    <Link
                      href={card.href}
                      className={styles.cardLink}
                      onClick={onNavigate}
                    >
                      פתח
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}

          {msg.actions && msg.actions.length > 0 && (
            <div className={styles.actions}>
              {msg.actions.map((a) => (
                <ButtonV2
                  key={a.label}
                  variant={a.sendText === "לא" ? "secondary" : "signal"}
                  className="flex-1"
                  onClick={() => onSend(a.sendText)}
                >
                  {a.label}
                </ButtonV2>
              ))}
            </div>
          )}

          {msg.suggestions && msg.suggestions.length > 0 && !msg.actions && (
            <div className={styles.chips}>
              {msg.suggestions.map((s) =>
                s.href ? (
                  <Link
                    key={s.label}
                    href={s.href}
                    className={styles.chip}
                    onClick={onNavigate}
                  >
                    {s.label}
                  </Link>
                ) : (
                  <button
                    key={s.label}
                    type="button"
                    className={styles.chip}
                    onClick={() => onSend(s.label)}
                  >
                    {s.label}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
      {loading && <p className={styles.loading}>חושב…</p>}
      {error && !loading && <p className={styles.errorInline}>{error}</p>}
    </div>
  );
}

function AgentComposer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function autoGrow() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || disabled) return;
        setInput("");
        if (ref.current) ref.current.style.height = "auto";
        onSend(text);
      }}
    >
      <textarea
        ref={ref}
        className={styles.textarea}
        rows={1}
        dir="rtl"
        placeholder="כתוב לסוכן…"
        value={input}
        disabled={disabled}
        aria-label="הודעה לסוכן"
        onChange={(e) => {
          setInput(e.target.value);
          autoGrow();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <button
        type="submit"
        className={styles.sendBtn}
        disabled={disabled || !input.trim()}
        aria-label="שלח"
      >
        <Send size={16} />
      </button>
    </form>
  );
}

function AgentPanelChrome({
  variant,
}: {
  variant: "companion" | "focus" | "desktop";
}) {
  const {
    messages,
    loading,
    error,
    send,
    closeAgent,
    expandToFocus,
    collapseToCompanion,
    openAgent,
  } = useAgentWorkspace();

  const title =
    variant === "focus" ? "REMATCHER Agent" : "REMATCHER Agent";
  const subtitle =
    variant === "focus" ? "מוכן לעזור" : "מלווה אותך בעבודה";

  return (
    <div
      className={cn(
        styles.panel,
        variant === "companion" && styles.companion,
        variant === "focus" && styles.focus,
        variant === "desktop" && styles.desktop
      )}
      role="dialog"
      aria-modal={variant === "focus"}
      aria-label={title}
    >
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <div className={styles.headerActions}>
          {variant === "focus" && (
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="הקטן"
              onClick={collapseToCompanion}
            >
              <Minimize2 size={18} />
            </button>
          )}
          {variant === "companion" && (
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="הרחב"
              onClick={expandToFocus}
            >
              <Maximize2 size={18} />
            </button>
          )}
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="סגור"
            onClick={closeAgent}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <ConversationList
        messages={messages}
        loading={loading}
        error={error}
        onSend={(text) => {
          if (text === "הוסף רכב" || text.includes("הוסף רכב")) {
            openAgent({ mode: "create_inventory", preferFocusOnMobile: true });
            return;
          }
          void send(text);
        }}
        onNavigate={closeAgent}
      />

      <div className={styles.footer}>
        <AgentComposer disabled={loading} onSend={(t) => void send(t)} />
      </div>
    </div>
  );
}

/**
 * Universal Agent Workspace UI — Companion / Focus / Desktop panel.
 * Conversation state lives in AgentWorkspaceProvider.
 */
export function AgentWorkspace() {
  const {
    presentationMode,
    isDesktop,
    toggleFab,
    closeAgent,
  } = useAgentWorkspace();

  const open = presentationMode !== "closed";
  const showFab = !(isDesktop && open) && presentationMode !== "focus";

  useEffect(() => {
    if (presentationMode !== "focus") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [presentationMode]);

  return (
    <>
      <button
        type="button"
        onClick={toggleFab}
        className={cn(styles.fab, !showFab && styles.fabHidden)}
        aria-label="REMATCHER Agent"
        aria-expanded={open}
      >
        <MessageSquare className={styles.fabIcon} strokeWidth={1.75} size={20} />
      </button>

      {open && isDesktop && (
        <AgentPanelChrome variant="desktop" />
      )}

      {open && !isDesktop && presentationMode === "companion" && (
        <>
          <button
            type="button"
            className={cn(styles.scrim, styles.scrimLight)}
            aria-label="סגור סוכן"
            onClick={closeAgent}
          />
          <AgentPanelChrome variant="companion" />
        </>
      )}

      {open && !isDesktop && presentationMode === "focus" && (
        <AgentPanelChrome variant="focus" />
      )}
    </>
  );
}

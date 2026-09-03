"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ButtonV2,
  Surface,
} from "@/components/ui/brand-v2";
import { InventoryImportPanel } from "@/components/inventory/inventory-import";
import type { ConversationState } from "@/services/assistant/conversation-state";
import { cn } from "@/lib/utils";
import styles from "./inventory-agent-workspace.module.css";

export const INVENTORY_WORKSPACE_EVENT = "rematcher:inventory-workspace";

type TabId = "agent" | "import";

interface Message {
  role: "user" | "assistant";
  text: string;
  suggestions?: Array<{ label: string; href?: string }>;
}

interface Props {
  open: boolean;
  initialTab?: TabId;
  vehicleId?: string | null;
  onClose: () => void;
  onInventoryChanged: (opts?: { highlightId?: string }) => void;
}

const OPENING =
  "כתוב לי את הרכבים כמו שנוח לך. אפשר אחד אחד, כמה יחד, לעדכן רכב קיים או לסמן רכב שנמכר.";

export function InventoryAgentWorkspace({
  open,
  initialTab = "agent",
  vehicleId,
  onClose,
  onInventoryChanged,
}: Props) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: OPENING },
  ]);
  const [conversation, setConversation] = useState<ConversationState>({
    sessionContext: { operatingMode: "inventory_management" },
  });
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    action: string;
    label: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const conversationRef = useRef(conversation);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(INVENTORY_WORKSPACE_EVENT, {
        detail: { open },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent(INVENTORY_WORKSPACE_EVENT, {
          detail: { open: false },
        })
      );
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      if (vehicleId) {
        setConversation((c) => ({
          ...c,
          sessionContext: { operatingMode: "inventory_management" },
          focusedObject: { type: "vehicle", id: vehicleId },
        }));
      }
    }
  }, [open, initialTab, vehicleId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      setMessages((m) => [...m, { role: "user", text }]);
      setInput("");
      setLoading(true);
      setStatus("בודק את הפרטים...");

      const conv: ConversationState = {
        ...conversationRef.current,
        sessionContext: {
          ...conversationRef.current.sessionContext,
          operatingMode: "inventory_management",
        },
        focusedObject: vehicleId
          ? { type: "vehicle", id: vehicleId }
          : conversationRef.current.focusedObject,
      };

      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            context: {
              route: "/inventory",
              mode: "inventory_management",
              entityType: vehicleId ? "vehicle" : undefined,
              entityId: vehicleId ?? undefined,
            },
            conversation: conv,
          }),
        });
        const data = await res.json();
        setLoading(false);
        setStatus(null);

        if (data.conversation) {
          setConversation({
            ...data.conversation,
            sessionContext: {
              ...data.conversation.sessionContext,
              operatingMode: "inventory_management",
            },
          });
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
          },
        ]);

        const mutation = data.inventoryMutationResult as
          | { type: string; vehicleId: string }
          | undefined;
        if (mutation?.vehicleId) {
          onInventoryChanged({
            highlightId:
              mutation.type === "created" || mutation.type === "updated"
                ? mutation.vehicleId
                : undefined,
          });
        }
      } catch {
        setLoading(false);
        setStatus(null);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "לא הצלחתי לעדכן כרגע. שום דבר לא השתנה.",
          },
        ]);
      }
    },
    [loading, onInventoryChanged, vehicleId]
  );

  if (!open) return null;

  return (
    <Surface depth="raised" className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>ניהול מלאי</h2>
          <p className={styles.sub}>הסוכן עובד איתך בתוך המסך הזה</p>
        </div>
        <ButtonV2 variant="ghost" onClick={onClose} className="text-sm">
          סגור
        </ButtonV2>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={cn(styles.tab, tab === "agent" && styles.tabActive)}
          onClick={() => setTab("agent")}
        >
          שיחה עם הסוכן
        </button>
        <button
          type="button"
          className={cn(styles.tab, tab === "import" && styles.tabActive)}
          onClick={() => setTab("import")}
        >
          העלאת קובץ
        </button>
      </div>

      {tab === "import" ? (
        <div className={styles.importPane}>
          <InventoryImportPanel
            onComplete={() => {
              onInventoryChanged();
              setTab("agent");
              setMessages((m) => [
                ...m,
                {
                  role: "assistant",
                  text: "הייבוא הושלם. המלאי עודכן. אפשר להמשיך כאן עם הסוכן.",
                },
              ]);
            }}
          />
        </div>
      ) : (
        <>
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
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className={styles.chips}>
                    {msg.suggestions.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        className={styles.chip}
                        onClick={() => {
                          if (s.href) {
                            window.location.href = s.href;
                            return;
                          }
                          if (s.label === "ערוך") {
                            send("ערוך");
                            return;
                          }
                          send(s.label);
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <p className={styles.status}>{status ?? "בודק..."}</p>
            )}
            <div ref={bottomRef} />
          </div>

          {pendingConfirmation && (
            <div className={styles.confirmRow}>
              <ButtonV2
                variant="signal"
                className="flex-1"
                disabled={loading}
                onClick={() => send("כן")}
              >
                {pendingConfirmation.action === "mark_sold"
                  ? "כן, נמכרה"
                  : pendingConfirmation.action === "update_inventory"
                    ? "עדכן"
                    : "שמור במלאי"}
              </ButtonV2>
              <ButtonV2
                variant="secondary"
                className="flex-1"
                disabled={loading}
                onClick={() => send("לא")}
              >
                ביטול
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
            <textarea
              className={styles.input}
              rows={3}
              placeholder='לדוגמה: קורולה 22, 62 אלף, 134 לסוחר — או "הקורולה נמכרה"'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <ButtonV2
              type="submit"
              variant="signal"
              className="w-full"
              disabled={loading || !input.trim()}
            >
              {loading ? "שולח..." : "שלח לסוכן"}
            </ButtonV2>
          </form>
        </>
      )}
    </Surface>
  );
}

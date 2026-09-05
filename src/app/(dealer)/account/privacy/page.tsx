"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  ButtonV2,
  PageHeaderV2,
  Surface,
} from "@/components/ui/brand-v2";
import {
  PRIVACY_CONSENT_LABELS_HE,
  PRIVACY_CONSENT_TYPES,
  type PrivacyConsentTypeKey,
} from "@/config/legal/versions";

type ConsentState = Record<PrivacyConsentTypeKey, boolean>;

type MemoryItem = {
  id: string;
  topicKey: string;
  kind: string;
  summary: string;
  confidence: number;
  expiresAt: string | null;
};

export default function PrivacyCenterPage() {
  const [consents, setConsents] = useState<ConsentState | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] =
    useState<PrivacyConsentTypeKey | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleteAccountStep, setDeleteAccountStep] = useState<
    "idle" | "confirm" | "requested"
  >("idle");
  const [deletionRequestId, setDeletionRequestId] = useState<string | null>(
    null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [confirmDeleteConversation, setConfirmDeleteConversation] =
    useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [statusRes, memRes] = await Promise.all([
      fetch("/api/privacy/status"),
      fetch("/api/privacy/memory"),
    ]);
    if (statusRes.ok) {
      const data = await statusRes.json();
      setConsents(data.consents);
    }
    if (memRes.ok) {
      const data = await memRes.json();
      setMemories(data.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patchConsent(consentType: PrivacyConsentTypeKey, value: boolean) {
    setMsg(null);
    if (
      consentType === "DEALER_MEMORY" &&
      consents?.DEALER_MEMORY === true &&
      value === false
    ) {
      setPendingRevoke("DEALER_MEMORY");
      return;
    }
    await applyConsent(consentType, value);
  }

  async function applyConsent(
    consentType: PrivacyConsentTypeKey,
    value: boolean
  ) {
    const res = await fetch("/api/privacy/consents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentType, value }),
    });
    if (!res.ok) {
      setMsg("שגיאה בעדכון ההרשאה");
      return;
    }
    const data = await res.json();
    setConsents(data.current);
    setPendingRevoke(null);
  }

  async function deleteMemory(id: string) {
    const res = await fetch(`/api/privacy/memory/${id}`, { method: "DELETE" });
    if (res.ok) {
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } else {
      setMsg("לא ניתן למחוק את הזיכרון");
    }
  }

  async function saveCorrection(id: string) {
    const summary = editSummary.trim();
    if (!summary) return;
    const res = await fetch(`/api/privacy/memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    });
    if (!res.ok) {
      setMsg("תיקון הזיכרון נכשל");
      return;
    }
    setEditingId(null);
    setEditSummary("");
    await load();
  }

  async function deleteAllMemory() {
    const res = await fetch("/api/privacy/memory", { method: "DELETE" });
    if (!res.ok) {
      setMsg("מחיקת הזיכרון נכשלה");
      return;
    }
    setConfirmDeleteAll(false);
    setMemories([]);
    setMsg("הזיכרון העסקי נמחק");
  }

  async function requestDeletion() {
    const res = await fetch("/api/privacy/account-deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.message ?? "רק בעל החשבון יכול לבקש מחיקה");
      return;
    }
    setDeletionRequestId(data.request?.id ?? null);
    setDeleteAccountStep("requested");
  }

  async function confirmDeletion() {
    if (!deletionRequestId) return;
    const res = await fetch("/api/privacy/account-deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "confirm",
        requestId: deletionRequestId,
      }),
    });
    if (!res.ok) {
      setMsg("אישור המחיקה נכשל");
      return;
    }
    await signOut({ callbackUrl: "/login" });
  }

  if (loading || !consents) {
    return (
      <div>
        <PageHeaderV2 title="פרטיות ו־AI" />
        <p className="text-sm text-v2-text-secondary">טוען...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <PageHeaderV2 title="פרטיות ו־AI" />

      {msg && (
        <p className="rounded-lg bg-v2-surface-secondary px-3 py-2 text-sm text-v2-text-secondary">
          {msg}
        </p>
      )}

      <Surface depth="raised" className="space-y-4 p-4">
        <h3 className="font-semibold text-v2-text-primary">ההרשאות שלי</h3>
        <p className="text-sm text-v2-text-muted">
          השינויים משפיעים על שימוש עתידי במידע. מחיקת מידע שכבר נשמר מתבצעת
          בנפרד כאשר האפשרות זמינה.
        </p>
        <ul className="space-y-4">
          {PRIVACY_CONSENT_TYPES.map((key) => (
            <li
              key={key}
              className="flex flex-col gap-2 border-b border-v2-border pb-3 last:border-0"
            >
              <span className="text-sm font-medium text-v2-text-primary">
                {PRIVACY_CONSENT_LABELS_HE[key]}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    consents[key]
                      ? "bg-v2-warm text-white"
                      : "bg-v2-surface-secondary text-v2-text-secondary"
                  }`}
                  onClick={() => patchConsent(key, true)}
                >
                  מאשר
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    !consents[key]
                      ? "bg-v2-warm text-white"
                      : "bg-v2-surface-secondary text-v2-text-secondary"
                  }`}
                  onClick={() => patchConsent(key, false)}
                >
                  לא מאשר
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Surface>

      {pendingRevoke === "DEALER_MEMORY" && (
        <Surface depth="raised" className="space-y-3 p-4">
          <h3 className="font-semibold text-v2-text-primary">
            להפסיק יצירת זיכרונות חדשים?
          </h3>
          <div className="space-y-2 text-sm text-v2-text-secondary">
            <p>
              הסוכן יפסיק לשמור זיכרונות עסקיים חדשים לשיחות עתידיות.
            </p>
            <p>
              הזיכרונות שכבר נשמרו לא יימחקו. ניתן למחוק אותם בנפרד.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonV2 variant="secondary" onClick={() => setPendingRevoke(null)}>
              ביטול
            </ButtonV2>
            <ButtonV2
              variant="primary"
              onClick={() => applyConsent("DEALER_MEMORY", false)}
            >
              הפסק שמירה
            </ButtonV2>
            <ButtonV2
              variant="secondary"
              onClick={async () => {
                await applyConsent("DEALER_MEMORY", false);
                setConfirmDeleteAll(true);
              }}
            >
              מחק גם את הזיכרונות הקיימים
            </ButtonV2>
          </div>
        </Surface>
      )}

      <Surface depth="raised" className="space-y-4 p-4">
        <h3 className="font-semibold text-v2-text-primary">מה הסוכן שלי זוכר</h3>
        <p className="text-sm text-v2-text-secondary">
          הזיכרון העסקי עוזר לסוכן להכיר את העסק שלך לאורך זמן. הוא אישי לעסק
          שלך ואינו נחשף לסוחרים אחרים.
        </p>
        {memories.length === 0 ? (
          <p className="text-sm text-v2-text-muted">אין זיכרונות פעילים כרגע.</p>
        ) : (
          <ul className="space-y-3">
            {memories.map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-v2-border p-3"
              >
                {editingId === m.id ? (
                  <div className="space-y-2">
                    <textarea
                      className="input min-h-[80px] w-full"
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <ButtonV2
                        variant="primary"
                        onClick={() => saveCorrection(m.id)}
                      >
                        שמור תיקון
                      </ButtonV2>
                      <ButtonV2
                        variant="secondary"
                        onClick={() => {
                          setEditingId(null);
                          setEditSummary("");
                        }}
                      >
                        ביטול
                      </ButtonV2>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-v2-text-primary">{m.summary}</p>
                    <p className="mt-1 text-xs text-v2-text-muted">
                      {m.kind} · {m.topicKey}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <ButtonV2
                        variant="secondary"
                        onClick={() => {
                          setEditingId(m.id);
                          setEditSummary(m.summary);
                        }}
                      >
                        תיקון
                      </ButtonV2>
                      <ButtonV2
                        variant="ghost"
                        onClick={() => deleteMemory(m.id)}
                      >
                        מחיקה
                      </ButtonV2>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <ButtonV2
          variant="secondary"
          className="w-full"
          onClick={() => setConfirmDeleteAll(true)}
        >
          מחק את כל הזיכרון העסקי שלי
        </ButtonV2>
      </Surface>

      {confirmDeleteAll && (
        <Surface depth="raised" className="space-y-3 p-4">
          <h3 className="font-semibold text-v2-text-primary">
            מחיקת כל הזיכרון העסקי
          </h3>
          <p className="text-sm text-v2-text-secondary">
            פעולה זו תמחק את הזיכרונות העסקיים שהסוכן שמר על העסק שלך. היא אינה
            מוחקת את החשבון, המלאי, הביקושים או היסטוריית הפעילות בבורסה.
          </p>
          <div className="flex gap-2">
            <ButtonV2
              variant="secondary"
              onClick={() => setConfirmDeleteAll(false)}
            >
              ביטול
            </ButtonV2>
            <ButtonV2 variant="primary" onClick={deleteAllMemory}>
              מחק את הזיכרון
            </ButtonV2>
          </div>
        </Surface>
      )}

      <Surface depth="raised" className="space-y-3 p-4">
        <h3 className="font-semibold text-v2-text-primary">מחיקת שיחה</h3>
        <p className="text-sm text-v2-text-secondary">
          השיחה תוסר מהיסטוריית השיחות שלך בהתאם למדיניות השמירה.
        </p>
        <p className="text-sm text-v2-text-secondary">
          זיכרונות עסקיים שכבר נשמרו בנפרד לא יימחקו אוטומטית.
        </p>
        <ButtonV2
          variant="secondary"
          className="w-full"
          onClick={() => setConfirmDeleteConversation(true)}
        >
          מחק שיחה
        </ButtonV2>
      </Surface>

      {confirmDeleteConversation && (
        <Surface depth="raised" className="space-y-3 p-4">
          <h3 className="font-semibold text-v2-text-primary">מחיקת שיחה</h3>
          <p className="text-sm text-v2-text-secondary">
            השיחה תוסר מהיסטוריית השיחות שלך בהתאם למדיניות השמירה.
          </p>
          <p className="text-sm text-v2-text-secondary">
            זיכרונות עסקיים שכבר נשמרו בנפרד לא יימחקו אוטומטית.
          </p>
          <div className="flex gap-2">
            <ButtonV2
              variant="secondary"
              onClick={() => setConfirmDeleteConversation(false)}
            >
              ביטול
            </ButtonV2>
            <ButtonV2
              variant="primary"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent("rematcher:clear-agent-conversation")
                  );
                }
                setConfirmDeleteConversation(false);
                setMsg("השיחה הנוכחית נוקתה בממשק.");
              }}
            >
              מחק שיחה
            </ButtonV2>
          </div>
        </Surface>
      )}

      <Surface depth="raised" className="space-y-3 p-4">
        <h3 className="font-semibold text-v2-text-primary">החשבון והמידע שלי</h3>
        <a
          href="mailto:privacy@rematcher.co.il"
          className="block text-sm text-v2-warm underline underline-offset-2"
          dir="ltr"
        >
          privacy@rematcher.co.il
        </a>
        <p className="text-sm text-v2-text-secondary">
          בקשה לעיון או תיקון מידע — פנו לכתובת למעלה.
        </p>
        <ButtonV2
          variant="secondary"
          className="w-full"
          onClick={() => setConfirmDeleteAll(true)}
        >
          מחק את הזיכרון העסקי שלי
        </ButtonV2>
        {deleteAccountStep === "idle" && (
          <ButtonV2
            variant="ghost"
            className="w-full"
            onClick={() => setDeleteAccountStep("confirm")}
          >
            מחיקת חשבון
          </ButtonV2>
        )}
      </Surface>

      {deleteAccountStep !== "idle" && (
        <Surface depth="raised" className="space-y-3 p-4">
          <h3 className="font-semibold text-v2-text-primary">
            מחיקת חשבון REMATCHER
          </h3>
          <div className="space-y-2 text-sm text-v2-text-secondary">
            <p>
              מחיקת החשבון תפסיק את השימוש בחשבון ותתחיל תהליך מחיקה של מידע
              אישי שאינו נדרש עוד.
            </p>
            <p>
              מידע מסוים עשוי להישמר כאשר הוא נדרש לצורכי אבטחה, תיעוד פעילות,
              בירור מחלוקת או חובה לפי דין.
            </p>
            <p>
              תובנות מצטברות שכבר אינן קשורות באופן סביר לחשבון מסוים אינן
              בהכרח ניתנות להפרדה או למחיקה בדיעבד.
            </p>
          </div>
          {deleteAccountStep === "confirm" && (
            <div className="flex gap-2">
              <ButtonV2
                variant="secondary"
                onClick={() => setDeleteAccountStep("idle")}
              >
                ביטול
              </ButtonV2>
              <ButtonV2 variant="primary" onClick={requestDeletion}>
                בקש מחיקת חשבון
              </ButtonV2>
            </div>
          )}
          {deleteAccountStep === "requested" && (
            <div className="space-y-2">
              <p className="text-sm text-v2-text-primary">
                בקשת המחיקה נוצרה. לאישור סופי לחצו למטה.
              </p>
              <div className="flex gap-2">
                <ButtonV2
                  variant="secondary"
                  onClick={() => {
                    setDeleteAccountStep("idle");
                    setDeletionRequestId(null);
                  }}
                >
                  ביטול
                </ButtonV2>
                <ButtonV2 variant="primary" onClick={confirmDeletion}>
                  אשר מחיקת חשבון
                </ButtonV2>
              </div>
            </div>
          )}
        </Surface>
      )}

      <Surface depth="raised" className="space-y-2 p-4">
        <Link
          href="/privacy"
          className="block text-sm text-v2-warm underline underline-offset-2"
        >
          מדיניות פרטיות ו־AI
        </Link>
        <Link
          href="/terms"
          className="block text-sm text-v2-warm underline underline-offset-2"
        >
          תנאי שימוש
        </Link>
      </Surface>
    </div>
  );
}

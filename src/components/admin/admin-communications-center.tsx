"use client";

import { useCallback, useEffect, useState } from "react";
import { ButtonV2, PageHeaderV2, Surface } from "@/components/ui/brand-v2";

type AudienceUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  dealerNames: string[];
  hasPushSubscription: boolean;
  subscriptionCount: number;
};

type Preview = {
  selectedCount: number;
  eligibleCount: number;
  notSubscribedCount: number;
  selected: AudienceUser[];
};

export function AdminCommunicationsCenter() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [internalName, setInternalName] = useState("");
  const [destinationLink, setDestinationLink] = useState("/activity");
  const [audienceType, setAudienceType] = useState<"ALL" | "SINGLE" | "MULTIPLE">("SINGLE");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<AudienceUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<unknown[]>([]);
  const [stats, setStats] = useState<{ subscribedUsers: number; notSubscribedUsers: number; totalSubscriptions: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmBroadcast, setConfirmBroadcast] = useState(false);

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/admin/communications");
    if (res.ok) {
      const data = await res.json();
      setHistory(data.history ?? []);
      setStats(data.stats ?? null);
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  async function searchUsers() {
    const res = await fetch(`/api/admin/communications/audience?q=${encodeURIComponent(searchQ)}`);
    if (res.ok) {
      const data = await res.json();
      setSearchResults(data.users ?? []);
    }
  }

  function toggleUser(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function refreshPreview() {
    const res = await fetch("/api/admin/communications/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audienceType,
        userIds: audienceType === "ALL" ? undefined : selectedIds,
      }),
    });
    if (res.ok) {
      setPreview(await res.json());
    }
  }

  async function send(testOnly = false) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/communications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        internalName: internalName || undefined,
        destinationLink: destinationLink || "/activity",
        audienceType,
        userIds: audienceType === "ALL" ? undefined : selectedIds,
        confirmBroadcast: audienceType === "ALL" ? confirmBroadcast : true,
        testOnly,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "שליחה נכשלה");
      return;
    }
    setMessage(
      testOnly
        ? `בדיקה נשלחה (${data.sent ?? 0} מכשירים)`
        : `נשלח (${data.sent ?? 0}), נכשל (${data.failed ?? 0})`
    );
    await loadMeta();
  }

  return (
    <div className="space-y-6">
      <PageHeaderV2
        eyebrow="Admin"
        title="מרכז תקשורת Push"
        subtitle="שליחת הודעות מ-REMATCHER Admin למשתמשים — עם מעקב מלא"
      />

      {stats && (
        <Surface depth="raised" className="p-4">
          <p className="text-sm text-v2-text-secondary">
            מנויים Push: <strong>{stats.subscribedUsers}</strong> משתמשים ·{" "}
            <strong>{stats.totalSubscriptions}</strong> מכשירים ·{" "}
            {stats.notSubscribedUsers} ללא מנוי
          </p>
        </Surface>
      )}

      <Surface depth="raised" className="space-y-4 p-4">
        <h2 className="font-semibold text-v2-text-primary">הודעה</h2>
        <input
          className="w-full rounded-lg border border-v2-border px-3 py-2 text-sm"
          placeholder="שם קמפיין פנימי (אופציונלי)"
          value={internalName}
          onChange={(e) => setInternalName(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-v2-border px-3 py-2 text-sm"
          placeholder="כותרת"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
        <textarea
          className="min-h-24 w-full rounded-lg border border-v2-border px-3 py-2 text-sm"
          placeholder="תוכן ההודעה"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
        />
        <input
          className="w-full rounded-lg border border-v2-border px-3 py-2 text-sm"
          placeholder="יעד (לדוגמה /matches)"
          value={destinationLink}
          onChange={(e) => setDestinationLink(e.target.value)}
        />
      </Surface>

      <Surface depth="raised" className="space-y-4 p-4">
        <h2 className="font-semibold text-v2-text-primary">קהל יעד</h2>
        <div className="flex flex-wrap gap-2">
          {(["SINGLE", "MULTIPLE", "ALL"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm ${audienceType === t ? "bg-v2-signal text-white" : "bg-v2-surface-secondary"}`}
              onClick={() => setAudienceType(t)}
            >
              {t === "SINGLE" ? "משתמש אחד" : t === "MULTIPLE" ? "מספר משתמשים" : "כל הזכאים"}
            </button>
          ))}
        </div>

        {audienceType !== "ALL" && (
          <>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-v2-border px-3 py-2 text-sm"
                placeholder="חיפוש: שם, אימייל, סוחר..."
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
              <ButtonV2 variant="secondary" onClick={searchUsers}>
                חפש
              </ButtonV2>
            </div>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {searchResults.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-v2-surface-secondary">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(u.id)}
                      onChange={() => toggleUser(u.id)}
                    />
                    <span>{u.name}</span>
                    <span className="text-v2-text-muted">{u.email}</span>
                    <span className={u.hasPushSubscription ? "text-success" : "text-warning"}>
                      {u.hasPushSubscription ? "Push ✓" : "ללא Push"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        {audienceType === "ALL" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmBroadcast}
              onChange={(e) => setConfirmBroadcast(e.target.checked)}
            />
            אני מאשר/ת שליחת broadcast לכל המשתמשים הזכאים
          </label>
        )}

        <ButtonV2 variant="secondary" onClick={refreshPreview}>
          תצוגה מקדימה של קהל
        </ButtonV2>

        {preview && (
          <div className="rounded-lg bg-v2-surface-secondary p-3 text-sm">
            <p>נבחרו: {preview.selectedCount}</p>
            <p>זכאים ל-Push: {preview.eligibleCount}</p>
            <p>ללא מנוי: {preview.notSubscribedCount}</p>
          </div>
        )}
      </Surface>

      <div className="flex flex-wrap gap-2">
        <ButtonV2 variant="secondary" disabled={busy} onClick={() => send(true)}>
          שלח בדיקה אלי
        </ButtonV2>
        <ButtonV2 variant="signal" disabled={busy} onClick={() => send(false)}>
          {busy ? "שולח..." : "שלח"}
        </ButtonV2>
      </div>

      {message && <p className="text-sm text-success">{message}</p>}
      {error && <p className="text-sm text-error">{error}</p>}

      <Surface depth="raised" className="p-4">
        <h2 className="mb-3 font-semibold text-v2-text-primary">היסטוריית תקשורת</h2>
        <ul className="space-y-2 text-sm">
          {(history as { id: string; title: string; source: string; sentCount: number; receivedCount: number; clickedCount: number; createdAt: string }[]).map((c) => (
            <li key={c.id} className="rounded border border-v2-border p-2">
              <p className="font-medium">{c.title}</p>
              <p className="text-v2-text-muted">
                {c.source} · נשלח {c.sentCount} · התקבל {c.receivedCount ?? "—"} · לחיצות {c.clickedCount ?? "—"}
              </p>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}

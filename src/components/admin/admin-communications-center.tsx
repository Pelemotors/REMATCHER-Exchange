"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ButtonV2, PageHeaderV2, Surface } from "@/components/ui/brand-v2";

type PushEligibilityStatus = "eligible" | "no_subscription" | "invalidated_only";

type AudienceUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  dealerNames: string[];
  hasPushSubscription: boolean;
  subscriptionCount: number;
  pushEligibilityStatus: PushEligibilityStatus;
  eligibilityLabel: string;
};

type Preview = {
  selectedCount: number;
  eligibleCount: number;
  notSubscribedCount: number;
  selected: AudienceUser[];
};

const PREVIEW_PAGE_SIZE = 20;

function eligibilityClass(status: PushEligibilityStatus) {
  switch (status) {
    case "eligible":
      return "text-success";
    case "invalidated_only":
      return "text-warning";
    default:
      return "text-v2-text-muted";
  }
}

export function AdminCommunicationsCenter() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [internalName, setInternalName] = useState("");
  const [destinationLink, setDestinationLink] = useState("/activity");
  const [audienceType, setAudienceType] = useState<"ALL" | "SINGLE" | "MULTIPLE">("SINGLE");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<AudienceUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [selectedUsers, setSelectedUsers] = useState<AudienceUser[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewFilter, setPreviewFilter] = useState("");
  const [previewPage, setPreviewPage] = useState(0);
  const [history, setHistory] = useState<unknown[]>([]);
  const [stats, setStats] = useState<{
    subscribedUsers: number;
    notSubscribedUsers: number;
    totalSubscriptions: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmBroadcast, setConfirmBroadcast] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedIds = useMemo(() => selectedUsers.map((u) => u.id), [selectedUsers]);

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

  useEffect(() => {
    if (audienceType === "SINGLE" && selectedUsers.length > 1) {
      setSelectedUsers((prev) => prev.slice(0, 1));
    }
  }, [audienceType, selectedUsers.length]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/admin/communications/audience?q=${encodeURIComponent(trimmed)}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.users ?? []);
        setHighlightIndex(0);
      }
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (audienceType === "ALL") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(searchQ);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQ, audienceType, runSearch]);

  function addUser(user: AudienceUser) {
    if (audienceType === "SINGLE") {
      setSelectedUsers([user]);
    } else {
      setSelectedUsers((prev) =>
        prev.some((u) => u.id === user.id) ? prev : [...prev, user]
      );
    }
    setSearchQ("");
    setSearchResults([]);
    setSearchOpen(false);
    setPreview(null);
  }

  function removeUser(id: string) {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== id));
    setPreview(null);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!searchOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
      setSearchOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightIndex >= 0 && searchResults[highlightIndex]) {
      e.preventDefault();
      addUser(searchResults[highlightIndex]);
    } else if (e.key === "Escape") {
      setSearchOpen(false);
    }
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
      setPreviewPage(0);
      setPreviewFilter("");
    }
  }

  const filteredPreviewUsers = useMemo(() => {
    if (!preview) return [];
    const q = previewFilter.trim().toLowerCase();
    if (!q) return preview.selected;
    return preview.selected.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.dealerNames.some((d) => d.toLowerCase().includes(q))
    );
  }, [preview, previewFilter]);

  const previewPages = Math.max(1, Math.ceil(filteredPreviewUsers.length / PREVIEW_PAGE_SIZE));
  const pagedPreviewUsers = filteredPreviewUsers.slice(
    previewPage * PREVIEW_PAGE_SIZE,
    (previewPage + 1) * PREVIEW_PAGE_SIZE
  );

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
    setShowSendConfirm(false);
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

  function requestSend() {
    if (!title.trim() || !body.trim()) {
      setError("כותרת ותוכן נדרשים");
      return;
    }
    if (audienceType !== "ALL" && selectedUsers.length === 0) {
      setError("יש לבחור לפחות משתמש אחד");
      return;
    }
    if (audienceType === "ALL" && !confirmBroadcast) {
      setError("נדרש אישור broadcast");
      return;
    }
    setError(null);
    setShowSendConfirm(true);
    if (!preview) void refreshPreview();
  }

  return (
    <div className="container-app space-y-6 py-6">
      <PageHeaderV2
        eyebrow="Admin"
        title="מרכז תקשורת Push"
        subtitle="שליחת הודעות מ-REMATCHER Admin למשתמשים — עם מעקב מלא"
      />

      {stats && (
        <Surface depth="raised" className="p-4">
          <p className="text-sm text-v2-text-secondary">
            מנויים Push: <strong className="text-v2-text-primary">{stats.subscribedUsers}</strong>{" "}
            משתמשים ·{" "}
            <strong className="text-v2-text-primary">{stats.totalSubscriptions}</strong> מכשירים ·{" "}
            {stats.notSubscribedUsers} ללא מנוי
          </p>
        </Surface>
      )}

      <Surface depth="raised" className="space-y-4 p-4">
        <h2 className="font-semibold text-v2-text-primary">הודעה</h2>
        <input
          className="input-v2"
          placeholder="שם קמפיין פנימי (אופציונלי)"
          value={internalName}
          onChange={(e) => setInternalName(e.target.value)}
        />
        <input
          className="input-v2"
          placeholder="כותרת"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
        <textarea
          className="input-v2"
          placeholder="תוכן ההודעה"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
        />
        <input
          className="input-v2"
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
              className={`rounded-lg px-3 py-1.5 text-sm ${
                audienceType === t
                  ? "bg-v2-signal text-white"
                  : "bg-v2-surface-secondary text-v2-text-primary"
              }`}
              onClick={() => {
                setAudienceType(t);
                setPreview(null);
              }}
            >
              {t === "SINGLE" ? "משתמש אחד" : t === "MULTIPLE" ? "מספר משתמשים" : "כל הזכאים"}
            </button>
          ))}
        </div>

        {audienceType !== "ALL" && (
          <>
            <div ref={searchRef} className="relative">
              <input
                className="input-v2"
                placeholder="הקלד שם, אימייל או סוחר — חיפוש חלקי"
                value={searchQ}
                onChange={(e) => {
                  setSearchQ(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={onSearchKeyDown}
                role="combobox"
                aria-expanded={searchOpen}
                aria-autocomplete="list"
              />
              {searchOpen && searchQ.trim() && (
                <ul
                  className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-v2-border bg-v2-surface-raised shadow-lg"
                  role="listbox"
                >
                  {searchLoading && (
                    <li className="px-3 py-2 text-sm text-v2-text-muted">טוען...</li>
                  )}
                  {!searchLoading && searchResults.length === 0 && (
                    <li className="px-3 py-2 text-sm text-v2-text-muted">לא נמצאו משתמשים</li>
                  )}
                  {!searchLoading &&
                    searchResults.map((u, idx) => {
                      const already = selectedUsers.some((s) => s.id === u.id);
                      return (
                        <li key={u.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={idx === highlightIndex}
                            disabled={already}
                            className={`flex w-full flex-col gap-0.5 px-3 py-2 text-start text-sm hover:bg-v2-surface-secondary disabled:opacity-50 ${
                              idx === highlightIndex ? "bg-v2-surface-secondary" : ""
                            }`}
                            onMouseEnter={() => setHighlightIndex(idx)}
                            onClick={() => addUser(u)}
                          >
                            <span className="font-medium text-v2-text-primary">{u.name}</span>
                            <span className="text-v2-text-muted">{u.email}</span>
                            {u.dealerNames.length > 0 && (
                              <span className="text-v2-text-secondary">{u.dealerNames.join(" · ")}</span>
                            )}
                            <span className={eligibilityClass(u.pushEligibilityStatus)}>
                              {u.eligibilityLabel}
                              {u.subscriptionCount > 1 ? ` · ${u.subscriptionCount} מכשירים` : ""}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-2 rounded-lg bg-v2-surface-secondary px-3 py-1.5 text-sm text-v2-text-primary"
                  >
                    <span>{u.name}</span>
                    <span className="text-v2-text-muted">{u.email}</span>
                    <button
                      type="button"
                      className="text-v2-text-muted hover:text-error"
                      aria-label={`הסר ${u.name}`}
                      onClick={() => removeUser(u.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {audienceType === "ALL" && (
          <label className="flex items-center gap-2 text-sm text-v2-text-secondary">
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
          <div className="space-y-3 rounded-lg border border-v2-border bg-v2-surface-secondary p-4">
            <div className="grid gap-1 text-sm text-v2-text-primary">
              <p>
                <strong>נבחרו:</strong> {preview.selectedCount}
              </p>
              <p>
                <strong>זכאים ל-Push:</strong> {preview.eligibleCount}
              </p>
              <p>
                <strong>לא זכאים:</strong> {preview.notSubscribedCount}
              </p>
            </div>

            <input
              className="input-v2"
              placeholder="סינון ברשימת הנמענים..."
              value={previewFilter}
              onChange={(e) => {
                setPreviewFilter(e.target.value);
                setPreviewPage(0);
              }}
            />

            <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
              {pagedPreviewUsers.map((u) => (
                <li
                  key={u.id}
                  className="rounded-lg border border-v2-border bg-v2-surface-raised px-3 py-2"
                >
                  <p className="font-medium text-v2-text-primary">{u.name}</p>
                  <p className="text-v2-text-muted">{u.email}</p>
                  {u.dealerNames.length > 0 && (
                    <p className="text-v2-text-secondary">{u.dealerNames.join(" · ")}</p>
                  )}
                  <p className={eligibilityClass(u.pushEligibilityStatus)}>
                    {u.eligibilityLabel}
                    {u.subscriptionCount > 1
                      ? ` (${u.subscriptionCount} מכשירים — נמען אחד)`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>

            {filteredPreviewUsers.length === 0 && (
              <p className="text-sm text-v2-text-muted">אין נמענים להצגה</p>
            )}

            {previewPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <ButtonV2
                  variant="ghost"
                  disabled={previewPage <= 0}
                  onClick={() => setPreviewPage((p) => p - 1)}
                >
                  הקודם
                </ButtonV2>
                <span className="text-v2-text-muted">
                  עמוד {previewPage + 1} / {previewPages}
                </span>
                <ButtonV2
                  variant="ghost"
                  disabled={previewPage >= previewPages - 1}
                  onClick={() => setPreviewPage((p) => p + 1)}
                >
                  הבא
                </ButtonV2>
              </div>
            )}

            <p className="text-xs text-v2-text-muted">
              מוצגים {pagedPreviewUsers.length} מתוך {filteredPreviewUsers.length} (סה״כ{" "}
              {preview.selectedCount})
            </p>
          </div>
        )}
      </Surface>

      <div className="flex flex-wrap gap-2">
        <ButtonV2 variant="secondary" disabled={busy} onClick={() => send(true)}>
          שלח בדיקה אלי
        </ButtonV2>
        <ButtonV2 variant="signal" disabled={busy} onClick={requestSend}>
          {busy ? "שולח..." : "שלח"}
        </ButtonV2>
      </div>

      {showSendConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <Surface depth="raised" className="max-h-[85vh] w-full max-w-lg overflow-y-auto p-4">
            <h3 className="mb-3 text-lg font-semibold text-v2-text-primary">אישור שליחה</h3>
            <dl className="space-y-2 text-sm text-v2-text-secondary">
              <div>
                <dt className="font-medium text-v2-text-primary">כותרת</dt>
                <dd>{title}</dd>
              </div>
              <div>
                <dt className="font-medium text-v2-text-primary">תוכן</dt>
                <dd>{body}</dd>
              </div>
              <div>
                <dt className="font-medium text-v2-text-primary">יעד</dt>
                <dd dir="ltr">{destinationLink}</dd>
              </div>
              <div>
                <dt className="font-medium text-v2-text-primary">נמענים</dt>
                <dd>
                  נבחרו {preview?.selectedCount ?? selectedUsers.length} · זכאים{" "}
                  {preview?.eligibleCount ?? "—"}
                </dd>
              </div>
            </dl>
            {(preview?.selected ?? selectedUsers).length > 0 && (
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">
                {(preview?.selected ?? selectedUsers).map((u) => (
                  <li key={u.id} className="text-v2-text-secondary">
                    {u.name} · {u.email} · {u.eligibilityLabel}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-2">
              <ButtonV2 variant="signal" disabled={busy} onClick={() => send(false)}>
                אשר שליחה
              </ButtonV2>
              <ButtonV2 variant="secondary" onClick={() => setShowSendConfirm(false)}>
                ביטול
              </ButtonV2>
            </div>
          </Surface>
        </div>
      )}

      {message && <p className="text-sm text-success">{message}</p>}
      {error && <p className="text-sm text-error">{error}</p>}

      <Surface depth="raised" className="p-4">
        <h2 className="mb-3 font-semibold text-v2-text-primary">היסטוריית תקשורת</h2>
        <ul className="space-y-2 text-sm">
          {(
            history as {
              id: string;
              title: string;
              source: string;
              sentCount: number;
              receivedCount: number;
              clickedCount: number;
              createdAt: string;
            }[]
          ).map((c) => (
            <li key={c.id} className="rounded border border-v2-border p-2">
              <p className="font-medium text-v2-text-primary">{c.title}</p>
              <p className="text-v2-text-muted">
                {c.source} · נשלח {c.sentCount} · התקבל {c.receivedCount ?? "—"} · לחיצות{" "}
                {c.clickedCount ?? "—"}
              </p>
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  ButtonV2,
  EmptyStateV2,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";
import { CreateDemandFlow } from "@/components/demand/create-demand-flow";
import { useSetAgentPageContext } from "@/components/assistant/agent-workspace-provider";
import type { EnrichedDemand } from "@/services/demand/demand-queries";
import type { BuyerMatchListItem } from "@/services/matching/list-buyer-matches";
import { formatNumber, formatRelative } from "@/lib/utils";
import { interestLane } from "@/lib/commercial-ux";
import styles from "./my-searches.module.css";

function constraintLine(demand: EnrichedDemand): string {
  const parts = [
    demand.subtitle,
    ...demand.tags.slice(0, 2),
  ].filter(Boolean);
  return parts.join(" · ");
}

function humanStatus(demand: EnrichedDemand): string | null {
  if (demand.uxStatus === "EXPIRING") return "מסתיים בקרוב";
  if (demand.uxStatus === "ACTIVE") return "פעיל";
  if (demand.uxStatus === "PENDING_CONFIRMATION") return "ממתין לאישור";
  if (demand.uxStatus === "EXPIRED") return "הסתיים";
  if (demand.uxStatus === "CLOSED") return "נסגר";
  return null;
}

function canEditDemand(demand: EnrichedDemand): boolean {
  return ["ACTIVE", "EXPIRING", "PENDING_CONFIRMATION", "EXPIRED"].includes(
    demand.uxStatus
  );
}

function vehicleTitle(vehicle: BuyerMatchListItem["vehicle"]): string {
  return (
    [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") ||
    "רכב"
  );
}

function vehicleMeta(vehicle: BuyerMatchListItem["vehicle"]): string {
  const parts: string[] = [];
  if (vehicle.mileage != null) parts.push(`${formatNumber(vehicle.mileage)} ק״מ`);
  if (vehicle.region) parts.push(vehicle.region);
  if (vehicle.color) parts.push(vehicle.color);
  if (vehicle.trim) parts.push(vehicle.trim);
  else if (vehicle.ownershipHand) parts.push(`יד ${vehicle.ownershipHand}`);
  return parts.slice(0, 3).join(" · ");
}

export function DemandPageClient({
  initialActive,
  initialEnded,
  initialMode,
  initialOpenId,
}: {
  initialActive: EnrichedDemand[];
  initialEnded: EnrichedDemand[];
  initialMode: "list" | "create" | "edit";
  initialOpenId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const openId = searchParams.get("id") ?? initialOpenId;

  const [mode, setMode] = useState<"list" | "create" | "edit" | "detail">(
    initialOpenId ? "detail" : initialMode
  );
  const [tab, setTab] = useState<"active" | "ended">("active");
  const [active, setActive] = useState<EnrichedDemand[]>(initialActive);
  const [ended, setEnded] = useState<EnrichedDemand[]>(initialEnded);
  const [detailDemand, setDetailDemand] = useState<EnrichedDemand | null>(null);
  const [matches, setMatches] = useState<BuyerMatchListItem[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editDemand, setEditDemand] = useState<EnrichedDemand | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useSetAgentPageContext({ surface: "demand", route: "/demand" }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/demands?history=true", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setActive(data.active ?? []);
    setEnded(data.ended ?? []);
  }, []);

  const loadMatchesForDemand = useCallback(async (demandId: string) => {
    setMatchesLoading(true);
    setMatchesError(null);
    try {
      const res = await fetch(
        `/api/matches?demandId=${encodeURIComponent(demandId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setMatchesError("לא הצלחנו לטעון תוצאות. ננסה שוב אוטומטית.");
        return;
      }
      const data = await res.json();
      setMatches(Array.isArray(data) ? data : []);
    } catch {
      setMatchesError("לא הצלחנו לטעון תוצאות. בדוק את החיבור.");
    } finally {
      setMatchesLoading(false);
    }
  }, []);

  const openDetail = useCallback(
    (demand: EnrichedDemand, pushUrl = true) => {
      setDetailDemand(demand);
      setMode("detail");
      if (pushUrl) {
        router.replace(`/demand?id=${encodeURIComponent(demand.id)}`);
      }
      void loadMatchesForDemand(demand.id);
    },
    [loadMatchesForDemand, router]
  );

  useEffect(() => {
    if (!openId) return;
    const found =
      [...active, ...ended].find((d) => d.id === openId) ??
      [...initialActive, ...initialEnded].find((d) => d.id === openId) ??
      null;
    if (found) {
      setDetailDemand(found);
      setMode("detail");
      void loadMatchesForDemand(found.id);
    }
  }, [
    openId,
    active,
    ended,
    initialActive,
    initialEnded,
    loadMatchesForDemand,
  ]);

  useEffect(() => {
    if (!editId) return;
    const found = [...active, ...ended].find((d) => d.id === editId);
    if (found) {
      setEditDemand(found);
      setEditForm({ ...found.confirmed });
      setEditError(null);
      setMode("edit");
    }
  }, [editId, active, ended]);

  // Async matching: light poll while search detail is open and still looking.
  useEffect(() => {
    if (mode !== "detail" || !detailDemand) return;
    const isLive = ["ACTIVE", "EXPIRING"].includes(detailDemand.uxStatus);
    if (!isLive) return;

    const refresh = () => {
      void loadMatchesForDemand(detailDemand.id);
      void load();
    };

    const interval = window.setInterval(refresh, 4000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [mode, detailDemand, loadMatchesForDemand, load]);

  function exitToList() {
    setMode("list");
    setDetailDemand(null);
    setMatches([]);
    router.replace("/demand");
  }

  function exitEdit() {
    setEditDemand(null);
    setEditError(null);
    if (detailDemand) {
      setMode("detail");
      router.replace(`/demand?id=${encodeURIComponent(detailDemand.id)}`);
    } else {
      setMode("list");
      if (editId) router.replace("/demand");
    }
  }

  async function saveEdit() {
    if (!editDemand || saving) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/demands/${editDemand.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: editForm }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(
          typeof data.error === "string"
            ? data.error
            : "לא הצלחנו לעדכן את החיפוש. נסה שוב."
        );
        return;
      }
      await load();
      const refreshed = (
        await (async () => {
          const r = await fetch("/api/demands?history=true", {
            cache: "no-store",
          });
          if (!r.ok) return null;
          const data = await r.json();
          const all = [...(data.active ?? []), ...(data.ended ?? [])] as EnrichedDemand[];
          return all.find((d) => d.id === editDemand.id) ?? null;
        })()
      );
      if (refreshed) {
        setDetailDemand(refreshed);
        setMode("detail");
        router.replace(`/demand?id=${encodeURIComponent(refreshed.id)}`);
        void loadMatchesForDemand(refreshed.id);
      } else {
        exitEdit();
      }
    } catch {
      setEditError("לא הצלחנו לעדכן את החיפוש. בדוק את החיבור ונסה שוב.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRenew(id: string) {
    await fetch("/api/demands/lifecycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demandId: id, action: "renew" }),
    });
    await load();
    setTab("active");
  }

  async function handleClose(id: string) {
    if (!confirm("לסיים את החיפוש?")) return;
    await fetch("/api/demands/lifecycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demandId: id, action: "close" }),
    });
    await load();
    if (detailDemand?.id === id) exitToList();
  }

  async function handleInterest(matchId: string, action: "interested" | "reject") {
    setActionLoading(matchId);
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action }),
      });
      if (res.ok && detailDemand) {
        await loadMatchesForDemand(detailDemand.id);
      }
    } finally {
      setActionLoading(null);
    }
  }

  const list = useMemo(() => {
    const source = tab === "active" ? active : ended;
    if (tab !== "active") return source;
    return [...source].sort((a, b) => {
      if (a.hasAuthorizedMatch !== b.hasAuthorizedMatch) {
        return a.hasAuthorizedMatch ? -1 : 1;
      }
      return 0;
    });
  }, [tab, active, ended]);


  if (mode === "create") {
    return (
      <div className={styles.page}>
        <button type="button" className={styles.backLink} onClick={() => setMode("list")}>
          ← חזרה לחיפושים
        </button>
        <h1 className={styles.title}>חיפוש חדש</h1>
        <CreateDemandFlow
          onCreated={async () => {
            await load();
            setMode("list");
            router.replace("/demand");
          }}
          onCancel={() => setMode("list")}
        />
      </div>
    );
  }

  if (mode === "edit" && editDemand) {
    return (
      <div className={styles.page}>
        <button type="button" className={styles.backLink} onClick={exitEdit}>
          ← ביטול
        </button>
        <h1 className={styles.title}>עריכת חיפוש</h1>
        <p className={styles.detailMeta}>{editDemand.title}</p>
        <Surface depth="raised" className="mt-4 space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">יצרן</label>
              <input
                className="input"
                value={String(editForm.make ?? "")}
                onChange={(e) =>
                  setEditForm({ ...editForm, make: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">דגם</label>
              <input
                className="input"
                value={String(editForm.model ?? "")}
                onChange={(e) =>
                  setEditForm({ ...editForm, model: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">שנתון מינימום</label>
              <input
                className="input"
                type="number"
                value={String(editForm.yearMin ?? "")}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    yearMin: parseInt(e.target.value, 10) || null,
                  })
                }
              />
            </div>
            <div>
              <label className="label">תקציב מקסימום</label>
              <input
                className="input"
                type="number"
                value={String(editForm.budgetMax ?? "")}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    budgetMax: parseInt(e.target.value, 10) || null,
                  })
                }
              />
            </div>
          </div>
          {editError && <p className="text-sm text-error">{editError}</p>}
          <ButtonV2
            variant="signal"
            className="w-full"
            onClick={saveEdit}
            disabled={saving}
          >
            {saving ? "שומר..." : "שמור"}
          </ButtonV2>
        </Surface>
      </div>
    );
  }

  if (mode === "detail" && detailDemand) {
    const status = humanStatus(detailDemand);
    const isLive = ["ACTIVE", "EXPIRING"].includes(detailDemand.uxStatus);
    const pendingAction = matches.filter(
      (m) => interestLane(m.interest?.status, m.revealId) === "action"
    );

    return (
      <div className={styles.page}>
        <button type="button" className={styles.backLink} onClick={exitToList}>
          ← החיפושים שלי
        </button>

        <div className={styles.detailSummary}>
          <h1 className={styles.detailTitle}>{detailDemand.title}</h1>
          {constraintLine(detailDemand) && (
            <p className={styles.detailMeta}>{constraintLine(detailDemand)}</p>
          )}
          {status && <p className={styles.detailStatus}>{status}</p>}
          <div className={styles.detailActions}>
            {canEditDemand(detailDemand) && (
              <ButtonV2
                variant="secondary"
                className="text-sm"
                onClick={() => {
                  setEditDemand(detailDemand);
                  setEditForm({ ...detailDemand.confirmed });
                  setEditError(null);
                  setMode("edit");
                  router.replace(
                    `/demand?edit=${encodeURIComponent(detailDemand.id)}`
                  );
                }}
              >
                ערוך
              </ButtonV2>
            )}
            {detailDemand.uxStatus === "EXPIRED" && (
              <ButtonV2
                variant="signal"
                className="text-sm"
                onClick={() => void handleRenew(detailDemand.id)}
              >
                הפעל מחדש
              </ButtonV2>
            )}
            {isLive && (
              <ButtonV2
                variant="ghost"
                className="text-sm"
                onClick={() => void handleClose(detailDemand.id)}
              >
                סיים חיפוש
              </ButtonV2>
            )}
          </div>
        </div>

        {matchesLoading && matches.length === 0 ? (
          <SkeletonBlockV2 lines={4} className="mt-6" />
        ) : matchesError && matches.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{matchesError}</p>
            <ButtonV2
              variant="secondary"
              className="mt-3"
              onClick={() =>
                detailDemand && void loadMatchesForDemand(detailDemand.id)
              }
            >
              נסה שוב
            </ButtonV2>
          </div>
        ) : matches.length > 0 ? (
          <>
            <h2 className={styles.resultsHeading}>
              נמצאו {matches.length}{" "}
              {matches.length === 1 ? "רכב שעשוי להתאים" : "רכבים שעשויים להתאים"}
            </h2>
            {pendingAction.length > 0 && (
              <p className={styles.resultsSub}>
                {pendingAction.length === 1
                  ? "רכב אחד מחכה להחלטה שלך"
                  : `${pendingAction.length} רכבים מחכים להחלטה שלך`}
              </p>
            )}
            <div>
              {matches.map((m) => {
                const lane = interestLane(m.interest?.status, m.revealId);
                const connected = Boolean(m.revealId);
                const waiting = lane === "waiting";
                const showActions = lane === "action" && !connected;
                return (
                  <div key={m.id} className={styles.matchRow}>
                    {m.vehicle.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.vehicle.imageUrl}
                        alt=""
                        className={styles.thumbImg}
                      />
                    ) : (
                      <div className={styles.thumb} aria-hidden />
                    )}
                    <div className={styles.matchBody}>
                      <p className={styles.matchTitle}>
                        {vehicleTitle(m.vehicle)}
                      </p>
                      {vehicleMeta(m.vehicle) && (
                        <p className={styles.matchLine}>
                          {vehicleMeta(m.vehicle)}
                        </p>
                      )}
                      {connected && m.revealId && (
                        <p className={styles.connectedNote}>
                          <a href={`/reveals/${m.revealId}`}>החיבור נפתח — לצפייה</a>
                        </p>
                      )}
                      {waiting && !connected && (
                        <p className={styles.waitingNote}>
                          שלחנו לצד השני — ממתינים לתשובה
                        </p>
                      )}
                      {showActions && (
                        <div className={styles.matchActions}>
                          <ButtonV2
                            variant="signal"
                            className="w-full text-sm"
                            disabled={actionLoading === m.id}
                            onClick={() =>
                              void handleInterest(m.id, "interested")
                            }
                          >
                            {actionLoading === m.id
                              ? "שולח..."
                              : "מתאים לי"}
                          </ButtonV2>
                          <ButtonV2
                            variant="ghost"
                            className="w-full text-sm"
                            disabled={actionLoading === m.id}
                            onClick={() => void handleInterest(m.id, "reject")}
                          >
                            לא רלוונטי
                          </ButtonV2>
                        </div>
                      )}
                    </div>
                    <ChevronLeft
                      className={styles.chevron}
                      size={18}
                      aria-hidden
                    />
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>
              {isLive
                ? "החיפוש פעיל. REMATCHER עדיין מחפשת ברשת."
                : "אין רכבים להצגה עבור החיפוש הזה"}
            </p>
            {isLive && (
              <p className={styles.emptyBody}>
                נעדכן כאן ברגע שיופיע רכב שמתאים — אפשר להמתין במסך הזה.
              </p>
            )}
            {isLive && (
              <p className={styles.refreshHint}>מתעדכן אוטומטית…</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>החיפושים שלי</h1>
        <ButtonV2 variant="signal" onClick={() => setMode("create")}>
          + חיפוש חדש
        </ButtonV2>
      </div>

      <div className={styles.segment} role="tablist" aria-label="סינון חיפושים">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "active"}
          className={`${styles.segmentBtn} ${
            tab === "active" ? styles.segmentBtnActive : ""
          }`}
          onClick={() => setTab("active")}
        >
          פעילים
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ended"}
          className={`${styles.segmentBtn} ${
            tab === "ended" ? styles.segmentBtnActive : ""
          }`}
          onClick={() => setTab("ended")}
        >
          הסתיימו
        </button>
      </div>

      {list.length === 0 ? (
        <div className={styles.empty}>
          {tab === "active" ? (
            <EmptyStateV2
              title="אין חיפושים פעילים"
              description="פתח חיפוש כדי ש-REMATCHER תבדוק את הרשת עבור הלקוח שלך."
              action={
                <ButtonV2 variant="signal" onClick={() => setMode("create")}>
                  + חיפוש חדש
                </ButtonV2>
              }
            />
          ) : (
            <p className={styles.emptyBody}>אין חיפושים שהסתיימו.</p>
          )}
        </div>
      ) : (
        <div className={styles.list}>
          {list.map((d) => (
            <button
              key={d.id}
              type="button"
              className={styles.row}
              onClick={() => openDetail(d)}
            >
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>{d.title}</p>
                {constraintLine(d) && (
                  <p className={styles.rowMeta}>{constraintLine(d)}</p>
                )}
                <div className={styles.rowFooter}>
                  <span className={styles.rowTime}>
                    {formatRelative(d.updatedAt || d.createdAt)}
                  </span>
                  <span
                    className={
                      d.authorizedMatchCount > 0
                        ? styles.rowCount
                        : styles.rowCountMuted
                    }
                  >
                    {d.authorizedMatchCount > 0
                      ? `${d.authorizedMatchCount} התאמות`
                      : tab === "active"
                        ? "מחפש…"
                        : "—"}
                  </span>
                </div>
              </div>
              <ChevronLeft className={styles.chevron} size={18} aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

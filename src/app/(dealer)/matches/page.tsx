"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BadgeV2,
  ButtonV2,
  EmptyStateV2,
  MatchCardSkeletonV2,
  PageHeaderV2,
  Surface,
} from "@/components/ui/brand-v2";
import { MatchCardV2 } from "@/components/cards/match-card-v2";
import { useSetAgentPageContext } from "@/components/assistant/agent-workspace-provider";
import { FilterPills, SnapshotBar } from "@/components/ux/snapshot-attention";
import {
  EMPTY_COPY,
  interestLane,
  matchLaneLabel,
} from "@/lib/commercial-ux";
import type { MatchExplanation } from "@/lib/schemas/ai";
import styles from "./matches.module.css";

interface MatchItem {
  id: string;
  scoreBand: string | null;
  resolutionState?: string;
  potential?: boolean;
  infoRequestOpen?: boolean;
  decisionBlockingUnknowns?: string[];
  explanation: MatchExplanation;
  vehicle: Record<string, unknown>;
  interest: { status: string } | null;
  revealId?: string | null;
}

type TabId = "action" | "waiting" | "history";

export default function MatchesPage() {
  return (
    <Suspense fallback={<MatchCardSkeletonV2 />}>
      <MatchesPageContent />
    </Suspense>
  );
}

function MatchesPageContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "action";
  const focusId = searchParams.get("focus");
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [staleFocus, setStaleFocus] = useState(false);
  const [tab, setTab] = useState<TabId>(
    ["action", "waiting", "history"].includes(initialTab) ? initialTab : "action"
  );

  useSetAgentPageContext({ surface: "matches", route: "/matches" }, []);

  async function load() {
    const res = await fetch("/api/matches");
    const data = await res.json();
    const list: MatchItem[] = Array.isArray(data) ? data : [];
    setMatches(list);
    setLoading(false);

    if (focusId) {
      const found = list.find((m) => m.id === focusId);
      if (!found) {
        setStaleFocus(true);
      } else {
        setStaleFocus(false);
        const lane = interestLane(found.interest?.status, found.revealId);
        if (lane === "action" || lane === "waiting" || lane === "history") {
          setTab(lane);
        }
        void fetch("/api/events/interaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "match_opened",
            entityType: "CandidateMatch",
            entityId: focusId,
          }),
        }).catch(() => undefined);
        window.setTimeout(() => {
          document
            .getElementById(`match-${focusId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    const t = searchParams.get("tab") as TabId | null;
    if (t && ["action", "waiting", "history"].includes(t)) setTab(t);
  }, [searchParams]);

  async function handleAction(matchId: string, action: string) {
    setActionLoading(matchId);
    await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, action }),
    });
    setActionLoading(null);
    load();
  }

  const grouped = useMemo(() => {
    const action: MatchItem[] = [];
    const waiting: MatchItem[] = [];
    const history: MatchItem[] = [];
    for (const m of matches) {
      const lane = interestLane(m.interest?.status, m.revealId);
      if (lane === "action") action.push(m);
      else if (lane === "waiting") waiting.push(m);
      else history.push(m);
    }
    return { action, waiting, history };
  }, [matches]);

  const list = grouped[tab];

  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeaderV2
          title="התאמות"
          subtitle="הזדמנויות מהרשת — החלט אם שווה להמשיך"
        />
        <div className={styles.list}>
          <MatchCardSkeletonV2 />
          <MatchCardSkeletonV2 />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeaderV2
        title="התאמות"
        subtitle="הזדמנויות מהרשת — החלט אם שווה להמשיך"
        action={
          <ButtonV2 variant="signal" href="/demand?new=1" className="text-sm">
            + חיפוש חדש
          </ButtonV2>
        }
      />

      <SnapshotBar
        metrics={[
          {
            label: matchLaneLabel("action"),
            value: grouped.action.length,
            emphasize: grouped.action.length > 0,
          },
          {
            label: matchLaneLabel("waiting"),
            value: grouped.waiting.length,
          },
          {
            label: matchLaneLabel("history"),
            value: grouped.history.length,
          },
        ]}
      />

      <FilterPills
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        options={[
          {
            id: "action",
            label: `${matchLaneLabel("action")} (${grouped.action.length})`,
          },
          {
            id: "waiting",
            label: `${matchLaneLabel("waiting")} (${grouped.waiting.length})`,
          },
          {
            id: "history",
            label: `${matchLaneLabel("history")} (${grouped.history.length})`,
          },
        ]}
      />

      {staleFocus && (
        <Surface depth="secondary" className="mb-4 px-4 py-3">
          <p className="text-sm text-v2-text-secondary">
            ההתאמה מההתראה כבר אינה זמינה או אינה פעילה עבורך. מוצג המצב
            העדכני.
          </p>
        </Surface>
      )}

      {matches.length === 0 ? (
        <EmptyStateV2
          title={EMPTY_COPY.matches.title}
          description={EMPTY_COPY.matches.description}
          action={
            <ButtonV2 variant="signal" href="/demand?new=1">
              צור חיפוש
            </ButtonV2>
          }
        />
      ) : list.length === 0 ? (
        <EmptyStateV2
          title="אין פריטים בתור הזה"
          description={
            tab === "action"
              ? "כרגע אין התאמות שמחכות להחלטה שלך."
              : tab === "waiting"
                ? "אין התאמות שממתינות לצד השני."
                : "אין היסטוריה להצגה."
          }
          action={
            tab !== "action" ? (
              <ButtonV2 variant="secondary" onClick={() => setTab("action")}>
                עבור לדורש פעולה
              </ButtonV2>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.list}>
          {list.map((m) => {
            const connected = Boolean(m.revealId);
            const lane = interestLane(m.interest?.status, m.revealId);
            const waiting = lane === "waiting";
            const showActions = lane === "action" && !connected;
            return (
              <div
                key={m.id}
                id={`match-${m.id}`}
                className={`space-y-2 ${focusId === m.id ? "ring-2 ring-v2-signal rounded-lg" : ""}`}
              >
                {connected && (
                  <Surface depth="secondary" className="px-3 py-2">
                    <BadgeV2 variant="signal">החיבור נפתח</BadgeV2>
                  </Surface>
                )}
                {waiting && !connected && (
                  <Surface depth="secondary" className="px-3 py-2">
                    <BadgeV2 variant="warning">ממתין לצד השני</BadgeV2>
                  </Surface>
                )}
                <MatchCardV2
                  headline={m.explanation?.headline ?? "התאמה"}
                  summary={m.explanation?.summary ?? ""}
                  fits={m.explanation?.fits ?? []}
                  gaps={m.explanation?.gaps ?? []}
                  vehicle={m.vehicle as MatchItem["vehicle"]}
                  band={
                    m.potential
                      ? null
                      : (m.scoreBand as "STRONG" | "GOOD" | "ALTERNATIVE" | null)
                  }
                  potential={Boolean(m.potential)}
                  infoRequestOpen={Boolean(m.infoRequestOpen)}
                  loading={actionLoading === m.id}
                  showActions={showActions}
                  waiting={waiting}
                  connected={connected}
                  revealHref={m.revealId ? `/reveals/${m.revealId}` : undefined}
                  onInterested={() => handleAction(m.id, "interested")}
                  onRequestInfo={() => handleAction(m.id, "request_info")}
                  onReject={() => handleAction(m.id, "reject")}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

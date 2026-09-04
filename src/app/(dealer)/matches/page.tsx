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
  scoreBand: string;
  explanation: MatchExplanation;
  vehicle: Record<string, unknown>;
  interest: { status: string } | null;
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
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>(
    ["action", "waiting", "history"].includes(initialTab) ? initialTab : "action"
  );

  useSetAgentPageContext({ surface: "matches", route: "/matches" }, []);


  async function load() {
    const res = await fetch("/api/matches");
    setMatches(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

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
      const lane = interestLane(m.interest?.status);
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
            const lane = interestLane(m.interest?.status);
            const showActions = lane === "action";
            return (
              <div key={m.id} className="space-y-2">
                {lane === "waiting" && (
                  <Surface depth="secondary" className="px-3 py-2">
                    <BadgeV2 variant="warning">ממתין לצד השני</BadgeV2>
                  </Surface>
                )}
                <MatchCardV2
                  headline={m.explanation?.headline ?? "התאמה"}
                  summary={m.explanation?.summary ?? ""}
                  fits={m.explanation?.fits ?? []}
                  gaps={m.explanation?.gaps ?? []}
                  vehicle={
                    m.vehicle as MatchItem["vehicle"] & { b2bPrice?: number }
                  }
                  band={m.scoreBand as "STRONG" | "ALTERNATIVE"}
                  loading={actionLoading === m.id}
                  showActions={showActions}
                  onInterested={() => handleAction(m.id, "interested")}
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

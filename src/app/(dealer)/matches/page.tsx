"use client";

import { useEffect, useState } from "react";
import {
  ButtonV2,
  EmptyStateV2,
  MatchCardSkeletonV2,
  PageHeaderV2,
} from "@/components/ui/brand-v2";
import { MatchCardV2 } from "@/components/cards/match-card-v2";
import { COPY } from "@/config/brand";
import type { MatchExplanation } from "@/lib/schemas/ai";
import styles from "./matches.module.css";

interface MatchItem {
  id: string;
  scoreBand: string;
  explanation: MatchExplanation;
  vehicle: Record<string, unknown>;
  interest: { status: string } | null;
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/matches");
    setMatches(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

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

  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeaderV2
          title="התאמות"
          subtitle="התאמות אנונימיות — החלט אם שווה להיחשף"
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
        subtitle="התאמות אנונימיות — החלט אם שווה להיחשף"
        action={
          <ButtonV2 variant="signal" href="/demand" className="text-sm">
            + חיפוש חדש
          </ButtonV2>
        }
      />

      {matches.length === 0 ? (
        <EmptyStateV2
          title={COPY.emptyMatches.title}
          description={COPY.emptyMatches.description}
          action={
            <ButtonV2 variant="signal" href="/demand">
              צור חיפוש
            </ButtonV2>
          }
        />
      ) : (
        <div className={styles.list}>
          {matches.map((m) => (
            <MatchCardV2
              key={m.id}
              headline={m.explanation?.headline ?? "התאמה"}
              summary={m.explanation?.summary ?? ""}
              fits={m.explanation?.fits ?? []}
              gaps={m.explanation?.gaps ?? []}
              vehicle={
                m.vehicle as MatchItem["vehicle"] & { b2bPrice?: number }
              }
              band={m.scoreBand as "STRONG" | "ALTERNATIVE"}
              loading={actionLoading === m.id}
              showActions={!m.interest || m.interest.status === "NO_RESPONSE"}
              onInterested={() => handleAction(m.id, "interested")}
              onReject={() => handleAction(m.id, "reject")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

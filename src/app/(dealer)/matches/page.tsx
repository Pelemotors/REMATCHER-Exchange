"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoadingSpinner } from "@/components/ui/common";
import { BrandV2Scope, SectionHeader, EmptyStateV2 } from "@/components/ui/brand-v2";
import { MatchCardV2 } from "@/components/cards/match-card-v2";
import { COPY } from "@/config/brand";
import type { MatchExplanation } from "@/lib/schemas/ai";

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
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <BrandV2Scope className="-mx-4 -mt-4 px-4 pt-4 md:-mx-6 md:px-6">
      <div>
        <SectionHeader
          title="התאמות"
          subtitle="התאמות אנונימיות — החלט אם שווה להיחשף"
          action={
            <Link href="/demand" className="v2-btn-signal text-sm">
              + חיפוש חדש
            </Link>
          }
        />

        {matches.length === 0 ? (
          <EmptyStateV2
            title={COPY.emptyMatches.title}
            description={COPY.emptyMatches.description}
            action={
              <Link href="/demand" className="v2-btn-signal">
                צור חיפוש
              </Link>
            }
          />
        ) : (
          <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            {matches.map((m) => (
              <MatchCardV2
                key={m.id}
                headline={m.explanation?.headline ?? "התאמה"}
                summary={m.explanation?.summary ?? ""}
                fits={m.explanation?.fits ?? []}
                gaps={m.explanation?.gaps ?? []}
                vehicle={m.vehicle as MatchItem["vehicle"] & { b2bPrice?: number }}
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
    </BrandV2Scope>
  );
}

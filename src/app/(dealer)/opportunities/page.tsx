"use client";

import { useEffect, useState } from "react";
import {
  BadgeV2,
  EmptyStateV2,
  MatchCardSkeletonV2,
  PageHeaderV2,
  Surface,
} from "@/components/ui/brand-v2";
import { OpportunityCard } from "@/components/cards/match-card";
import { COPY } from "@/config/brand";
import type { MatchExplanation } from "@/lib/schemas/ai";

interface OppItem {
  id: string;
  status: string;
  demandSummary: Record<string, unknown>;
  vehicle: Record<string, unknown>;
  explanation: MatchExplanation;
}

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<OppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/opportunities");
    setOpps(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAction(id: string, action: string) {
    setActionLoading(id);
    const res = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: id, action }),
    });
    const data = await res.json();
    setActionLoading(null);
    if (action === "interested" && data.reveal?.id) {
      window.location.href = `/reveals/${data.reveal.id}`;
      return;
    }
    load();
  }

  if (loading) {
    return (
      <div>
        <PageHeaderV2
          title="יש עניין ברכבים שלך"
          subtitle="הזדמנויות מהרשת — ללא חשיפת זהות עד עניין הדדי"
        />
        <div className="space-y-4">
          <MatchCardSkeletonV2 />
          <MatchCardSkeletonV2 />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeaderV2
        title="יש עניין ברכבים שלך"
        subtitle="הזדמנויות מהרשת — ללא חשיפת זהות עד עניין הדדי"
      />

      <Surface depth="secondary" className="mb-4 px-4 py-3">
        <BadgeV2 variant="signal">הזדמנות מהרשת</BadgeV2>
        <p className="mt-2 text-sm text-v2-text-secondary">
          סוחר מאומת הביע עניין ברכב שלך. זה אותו עולם הזדמנויות כמו התאמות —
          רק מצד המוכר.
        </p>
      </Surface>

      {opps.length === 0 ? (
        <EmptyStateV2
          title={COPY.emptyOpportunities.title}
          description={COPY.emptyOpportunities.description}
        />
      ) : (
        <div className="space-y-4">
          {opps.map((o) => (
            <OpportunityCard
              key={o.id}
              headline="יש עניין ברכב שלך"
              summary={
                o.explanation?.summary ?? "הביקוש מתאים לרכב שלך"
              }
              demandSummary={o.demandSummary}
              vehicleSummary={o.vehicle}
              gaps={o.explanation?.gaps ?? []}
              loading={actionLoading === o.id}
              onInterested={() => handleAction(o.id, "interested")}
              onReject={() => handleAction(o.id, "reject")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

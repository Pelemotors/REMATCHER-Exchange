"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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

function OpportunitiesContent() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const [opps, setOpps] = useState<OppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [staleFocus, setStaleFocus] = useState(false);

  async function load() {
    const res = await fetch("/api/opportunities");
    const data = await res.json();
    const list: OppItem[] = Array.isArray(data) ? data : [];
    setOpps(list);
    setLoading(false);
    if (focusId) {
      const found = list.find((o) => o.id === focusId);
      setStaleFocus(!found);
      if (found) {
        void fetch("/api/events/interaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "opportunity_opened",
            entityType: "SellerOpportunity",
            entityId: focusId,
          }),
        }).catch(() => undefined);
        window.setTimeout(() => {
          document
            .getElementById(`opp-${focusId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

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
    if (action === "interested" && data.error === "vehicle_unavailable") {
      setStaleFocus(true);
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

      {staleFocus && (
        <Surface depth="secondary" className="mb-4 px-4 py-3">
          <p className="text-sm text-v2-text-secondary">
            ההזדמנות מההתראה כבר אינה פעילה — ייתכן שהרכב אינו זמין או שהסטטוס
            השתנה. מוצג המצב העדכני.
          </p>
        </Surface>
      )}

      {opps.length === 0 ? (
        <EmptyStateV2
          title={COPY.emptyOpportunities.title}
          description={COPY.emptyOpportunities.description}
        />
      ) : (
        <div className="space-y-4">
          {opps.map((o) => (
            <div
              key={o.id}
              id={`opp-${o.id}`}
              className={
                focusId === o.id ? "ring-2 ring-v2-signal rounded-lg" : undefined
              }
            >
              <OpportunityCard
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<MatchCardSkeletonV2 />}>
      <OpportunitiesContent />
    </Suspense>
  );
}

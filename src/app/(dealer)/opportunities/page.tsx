"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BadgeV2,
  ButtonV2,
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
  sellerInterest?: { status: string } | null;
  revealId?: string | null;
}

function OpportunitiesContent() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const [opps, setOpps] = useState<OppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [staleFocus, setStaleFocus] = useState(false);
  const [declineFor, setDeclineFor] = useState<string | null>(null);

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

  async function handleAction(
    id: string,
    action: string,
    rejectReason?: string
  ) {
    setActionLoading(id);
    setDeclineFor(null);
    const res = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: id, action, rejectReason }),
    });
    const data = await res.json();
    setActionLoading(null);
    if (action === "interested" && data.reveal?.id) {
      window.location.href = `/reveals/${data.reveal.id}`;
      return;
    }
    if (
      action === "interested" &&
      (data.error === "vehicle_unavailable" ||
        data.error === "stale_opportunity")
    ) {
      setStaleFocus(true);
    }
    load();
  }

  if (loading) {
    return (
      <div>
        <PageHeaderV2
          title="הזדמנויות לרכבים שלך"
          subtitle="ביקוש רלוונטי מהרשת — ללא חשיפת זהות עד עניין הדדי"
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
        title="הזדמנויות לרכבים שלך"
        subtitle="ביקוש רלוונטי מהרשת — ללא חשיפת זהות עד עניין הדדי"
      />

      <Surface depth="secondary" className="mb-4 px-4 py-3">
        <BadgeV2 variant="signal">הזדמנות מהרשת</BadgeV2>
        <p className="mt-2 text-sm text-v2-text-secondary">
          כשיש ביקוש רלוונטי — תחליט אם להתקדם. זהות הצד השני נחשפת רק אחרי
          עניין הדדי.
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

      {declineFor && (
        <Surface depth="raised" className="mb-4 space-y-3 border border-v2-border p-4">
          <p className="text-sm font-medium text-v2-text-primary">
            למה לא כרגע?
          </p>
          <ButtonV2
            variant="secondary"
            className="w-full justify-start"
            disabled={actionLoading === declineFor}
            onClick={() =>
              handleAction(declineFor, "reject", "current_buyer")
            }
          >
            {COPY.sellerDeclineCurrentBuyer}
          </ButtonV2>
          <ButtonV2
            variant="secondary"
            className="w-full justify-start"
            disabled={actionLoading === declineFor}
            onClick={() => handleAction(declineFor, "reject", "sold")}
          >
            {COPY.sellerDeclineSold}
          </ButtonV2>
          <ButtonV2 variant="ghost" className="w-full" onClick={() => setDeclineFor(null)}>
            ביטול
          </ButtonV2>
        </Surface>
      )}

      {opps.length === 0 ? (
        <EmptyStateV2
          title={COPY.emptyOpportunities.title}
          description={COPY.emptyOpportunities.description}
        />
      ) : (
        <div className="space-y-4">
          {opps.map((o) => {
            const connected = Boolean(o.revealId);
            const waiting =
              !connected &&
              (o.sellerInterest?.status === "INTERESTED" ||
                o.status === "INTERESTED");
            const actionable =
              !connected &&
              !waiting &&
              o.status !== "REJECTED" &&
              o.status !== "CLOSED";
            return (
              <div
                key={o.id}
                id={`opp-${o.id}`}
                className={
                  focusId === o.id ? "ring-2 ring-v2-signal rounded-lg" : undefined
                }
              >
                {connected && (
                  <Surface depth="secondary" className="mb-2 px-3 py-2">
                    <BadgeV2 variant="signal">{COPY.connectionOpened}</BadgeV2>
                  </Surface>
                )}
                <OpportunityCard
                  headline={COPY.opportunity}
                  summary={
                    o.explanation?.summary ?? "הביקוש מתאים לרכב שלך"
                  }
                  demandSummary={o.demandSummary}
                  vehicleSummary={o.vehicle}
                  gaps={o.explanation?.gaps ?? []}
                  loading={actionLoading === o.id}
                  waiting={waiting}
                  connected={connected}
                  revealHref={o.revealId ? `/reveals/${o.revealId}` : undefined}
                  onInterested={
                    actionable
                      ? () => handleAction(o.id, "interested")
                      : undefined
                  }
                  onReject={
                    actionable ? () => setDeclineFor(o.id) : undefined
                  }
                />
              </div>
            );
          })}
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

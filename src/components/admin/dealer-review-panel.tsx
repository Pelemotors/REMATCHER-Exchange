"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ButtonV2,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";

interface DealerReview {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string | null;
  city: string | null;
  region: string | null;
  businessId: string | null;
  verificationStatus: string;
  createdAt: string;
  commercial: { freeRevealAllowance: number; freeRevealUsed: number } | null;
  onboardingState?: { completedAt: string | null; dismissedAt: string | null } | null;
  metrics?: {
    activeInventory: number;
    activeDemands: number;
    validatedMatches: number;
    reveals: number;
    outcomes: number;
    pushSubscriptions: number;
  };
  recentEvents?: Array<{
    eventType: string;
    entityType: string | null;
    createdAt: string;
  }>;
  owner: {
    name: string;
    email: string;
    phone: string | null;
    emailVerifiedAt: string | null;
  } | null;
}

export function DealerReviewPanel({ dealerId }: { dealerId: string }) {
  const router = useRouter();
  const [dealer, setDealer] = useState<DealerReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/dealers/${dealerId}`)
      .then((r) => r.json())
      .then((data) => {
        setDealer(data);
        setLoading(false);
      });
  }, [dealerId]);

  async function approve() {
    if (!confirm("לאשר את הסוחר להצטרף לרשת?")) return;
    setActionLoading(true);
    await fetch(`/api/admin/dealers/${dealerId}/approve`, { method: "POST" });
    setActionLoading(false);
    router.push("/admin/dealers");
    router.refresh();
  }

  async function reject() {
    if (!confirm("לדחות את הבקשה?")) return;
    setActionLoading(true);
    await fetch(`/api/admin/dealers/${dealerId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason }),
    });
    setActionLoading(false);
    router.push("/admin/dealers");
    router.refresh();
  }

  if (loading) return <SkeletonBlockV2 lines={4} />;
  if (!dealer?.id) return <p className="text-v2-text-secondary">סוחר לא נמצא</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-v2-warm">בדיקת סוחר</h1>
        <Link href="/admin/dealers" className="text-sm text-v2-signal">
          חזרה לתור
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Surface depth="raised" as="section" className="space-y-3 p-4">
          <h2 className="font-semibold text-v2-text-primary">פרטי העסק</h2>
          <p><span className="text-v2-text-muted">שם העסק:</span> {dealer.businessName}</p>
          <p><span className="text-v2-text-muted">עיר:</span> {dealer.city ?? "—"}</p>
          <p><span className="text-v2-text-muted">אזור:</span> {dealer.region ?? "—"}</p>
          <p><span className="text-v2-text-muted">ח.פ./עוסק:</span> {dealer.businessId ?? "—"}</p>
        </Surface>

        <Surface depth="raised" as="section" className="space-y-3 p-4">
          <h2 className="font-semibold text-v2-text-primary">איש קשר</h2>
          <p><span className="text-v2-text-muted">שם:</span> {dealer.contactName}</p>
          <p><span className="text-v2-text-muted">אימייל:</span> {dealer.owner?.email}</p>
          <p>
            <span className="text-v2-text-muted">אימייל מאומת:</span>{" "}
            {dealer.owner?.emailVerifiedAt ? "כן" : "לא"}
          </p>
          <p><span className="text-v2-text-muted">טלפון:</span> {dealer.phone}</p>
        </Surface>

        <Surface depth="raised" as="section" className="space-y-3 p-4 md:col-span-2">
          <h2 className="font-semibold text-v2-text-primary">מערכת</h2>
          <p><span className="text-v2-text-muted">Dealer ID:</span> {dealer.id}</p>
          <p><span className="text-v2-text-muted">סטטוס:</span> {dealer.verificationStatus}</p>
          <p>
            <span className="text-v2-text-muted">הרשמה:</span>{" "}
            {new Date(dealer.createdAt).toLocaleString("he-IL")}
          </p>
          {dealer.commercial && (
            <p>
              <span className="text-v2-text-muted">חיבורים חינמיים:</span>{" "}
              {dealer.commercial.freeRevealUsed}/{dealer.commercial.freeRevealAllowance}
            </p>
          )}
        </Surface>

        {dealer.metrics && (
          <Surface depth="raised" as="section" className="space-y-3 p-4 md:col-span-2">
            <h2 className="font-semibold text-v2-text-primary">פעילות Exchange</h2>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <p>רכבים: {dealer.metrics.activeInventory}</p>
              <p>חיפושים: {dealer.metrics.activeDemands}</p>
              <p>התאמות: {dealer.metrics.validatedMatches}</p>
              <p>חיבורים: {dealer.metrics.reveals}</p>
              <p>תוצאות: {dealer.metrics.outcomes}</p>
              <p>Push: {dealer.metrics.pushSubscriptions}</p>
            </div>
            {dealer.onboardingState && (
              <p className="text-sm text-v2-text-muted">
                Onboarding:{" "}
                {dealer.onboardingState.completedAt
                  ? "הושלם"
                  : dealer.onboardingState.dismissedAt
                    ? "דולג"
                    : "בתהליך / לא הושלם"}
              </p>
            )}
          </Surface>
        )}

        {dealer.recentEvents && dealer.recentEvents.length > 0 && (
          <Surface depth="raised" as="section" className="space-y-2 p-4 md:col-span-2">
            <h2 className="font-semibold text-v2-text-primary">אירועים אחרונים</h2>
            {dealer.recentEvents.map((e, i) => (
              <p key={i} className="text-sm text-v2-text-secondary">
                {e.eventType} · {new Date(e.createdAt).toLocaleString("he-IL")}
              </p>
            ))}
          </Surface>
        )}
      </div>

      {dealer.verificationStatus === "PENDING" && (
        <div className="flex flex-wrap gap-3">
          <ButtonV2
            variant="signal"
            disabled={actionLoading}
            onClick={approve}
          >
            אשר סוחר
          </ButtonV2>
          <ButtonV2
            variant="secondary"
            disabled={actionLoading}
            onClick={() => setShowReject(!showReject)}
          >
            דחה בקשה
          </ButtonV2>
        </div>
      )}

      {showReject && (
        <Surface depth="raised" className="space-y-3 p-4">
          <label className="label">סיבה פנימית (אופציונלי)</label>
          <textarea
            className="input min-h-[80px]"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <ButtonV2
            variant="secondary"
            disabled={actionLoading}
            onClick={reject}
          >
            אישור דחייה
          </ButtonV2>
        </Surface>
      )}
    </div>
  );
}

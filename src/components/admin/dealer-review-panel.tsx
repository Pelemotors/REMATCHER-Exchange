"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

  if (loading) return <p>טוען...</p>;
  if (!dealer?.id) return <p>סוחר לא נמצא</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">בדיקת סוחר</h1>
        <Link href="/admin/dealers" className="text-sm text-signal">
          חזרה לתור
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">פרטי העסק</h2>
          <p><span className="text-text-muted">שם העסק:</span> {dealer.businessName}</p>
          <p><span className="text-text-muted">עיר:</span> {dealer.city ?? "—"}</p>
          <p><span className="text-text-muted">אזור:</span> {dealer.region ?? "—"}</p>
          <p><span className="text-text-muted">ח.פ./עוסק:</span> {dealer.businessId ?? "—"}</p>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">איש קשר</h2>
          <p><span className="text-text-muted">שם:</span> {dealer.contactName}</p>
          <p><span className="text-text-muted">אימייל:</span> {dealer.owner?.email}</p>
          <p>
            <span className="text-text-muted">אימייל מאומת:</span>{" "}
            {dealer.owner?.emailVerifiedAt ? "כן" : "לא"}
          </p>
          <p><span className="text-text-muted">טלפון:</span> {dealer.phone}</p>
        </section>

        <section className="card space-y-3 md:col-span-2">
          <h2 className="font-semibold">מערכת</h2>
          <p><span className="text-text-muted">Dealer ID:</span> {dealer.id}</p>
          <p><span className="text-text-muted">סטטוס:</span> {dealer.verificationStatus}</p>
          <p>
            <span className="text-text-muted">הרשמה:</span>{" "}
            {new Date(dealer.createdAt).toLocaleString("he-IL")}
          </p>
          {dealer.commercial && (
            <p>
              <span className="text-text-muted">חיבורים חינמיים:</span>{" "}
              {dealer.commercial.freeRevealUsed}/{dealer.commercial.freeRevealAllowance}
            </p>
          )}
        </section>
      </div>

      {dealer.verificationStatus === "PENDING" && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={actionLoading}
            onClick={approve}
          >
            אשר סוחר
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={actionLoading}
            onClick={() => setShowReject(!showReject)}
          >
            דחה בקשה
          </button>
        </div>
      )}

      {showReject && (
        <div className="card space-y-3">
          <label className="label">סיבה פנימית (אופציונלי)</label>
          <textarea
            className="input min-h-[80px]"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={actionLoading}
            onClick={reject}
          >
            אישור דחייה
          </button>
        </div>
      )}
    </div>
  );
}

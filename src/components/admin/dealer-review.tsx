"use client";

import { useState } from "react";
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
  rejectionReason: string | null;
  commercial: {
    planSlug: string;
    freeRevealAllowance: number;
    freeRevealUsed: number;
  } | null;
  owner: {
    name: string;
    email: string;
    phone: string | null;
    emailVerified: boolean;
    emailVerifiedAt: string | null;
  } | null;
}

export function DealerReviewActions({ dealer }: { dealer: DealerReview }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  async function approve() {
    if (!confirm(`לאשר את ${dealer.businessName}?`)) return;
    setLoading("approve");
    await fetch(`/api/admin/dealers/${dealer.id}/approve`, { method: "POST" });
    setLoading(null);
    router.push("/admin/dealers");
    router.refresh();
  }

  async function reject() {
    if (!confirm(`לדחות את ${dealer.businessName}?`)) return;
    setLoading("reject");
    await fetch(`/api/admin/dealers/${dealer.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setLoading(null);
    router.push("/admin/dealers");
    router.refresh();
  }

  if (dealer.verificationStatus !== "PENDING") {
    return (
      <p className="text-sm text-text-muted">
        סטטוס: {dealer.verificationStatus}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="btn-primary w-full sm:w-auto"
        onClick={approve}
        disabled={loading !== null}
      >
        {loading === "approve" ? "מאשר..." : "אשר סוחר"}
      </button>
      {!showReject ? (
        <button
          type="button"
          className="btn-secondary w-full sm:w-auto"
          onClick={() => setShowReject(true)}
        >
          דחה בקשה
        </button>
      ) : (
        <div className="space-y-2">
          <textarea
            className="input min-h-[80px]"
            placeholder="סיבה פנימית (אופציונלי)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={reject}
            disabled={loading !== null}
          >
            {loading === "reject" ? "דוחה..." : "אשר דחייה"}
          </button>
        </div>
      )}
    </div>
  );
}

export function DealerReviewCard({ dealer }: { dealer: DealerReview }) {
  return (
    <div className="card space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h2 font-bold">{dealer.businessName}</h1>
          <p className="text-sm text-text-muted">Dealer ID: {dealer.id}</p>
        </div>
        <Link href="/admin/dealers" className="text-sm text-signal">
          חזרה לתור
        </Link>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">פרטי העסק</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-text-muted">עיר</dt><dd>{dealer.city ?? "—"}</dd></div>
          <div><dt className="text-text-muted">אזור</dt><dd>{dealer.region ?? "—"}</dd></div>
          <div><dt className="text-text-muted">ח.פ./עוסק</dt><dd>{dealer.businessId ?? "—"}</dd></div>
          <div><dt className="text-text-muted">הרשמה</dt><dd>{new Date(dealer.createdAt).toLocaleString("he-IL")}</dd></div>
        </dl>
      </section>

      {dealer.owner && (
        <section>
          <h2 className="mb-3 font-semibold">איש קשר</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-text-muted">שם</dt><dd>{dealer.owner.name}</dd></div>
            <div><dt className="text-text-muted">אימייל</dt><dd dir="ltr">{dealer.owner.email}</dd></div>
            <div><dt className="text-text-muted">Email Verified</dt><dd>{dealer.owner.emailVerified ? "כן" : "לא"}</dd></div>
            <div><dt className="text-text-muted">טלפון</dt><dd dir="ltr">{dealer.owner.phone ?? dealer.phone}</dd></div>
          </dl>
        </section>
      )}

      {dealer.commercial && (
        <section>
          <h2 className="mb-3 font-semibold">מסחרי</h2>
          <p className="text-sm text-text-secondary">
            {dealer.commercial.freeRevealUsed} / {dealer.commercial.freeRevealAllowance} חיבורים חינמיים · {dealer.commercial.planSlug}
          </p>
        </section>
      )}

      <DealerReviewActions dealer={dealer} />
    </div>
  );
}

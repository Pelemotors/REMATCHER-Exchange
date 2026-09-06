"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ButtonV2, SkeletonBlockV2, Surface } from "@/components/ui/brand-v2";

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
  isActive: boolean;
  createdAt: string;
  commercial: { freeRevealAllowance: number; freeRevealUsed: number } | null;
  metrics?: { activeInventory: number; activeDemands: number; validatedMatches: number; reveals: number; outcomes: number; pushSubscriptions: number };
  owner: { id: string; name: string; email: string; phone: string | null; emailVerifiedAt: string | null } | null;
}

export function DealerReviewPanel({ dealerId }: { dealerId: string }) {
  const router = useRouter();
  const [dealer, setDealer] = useState<DealerReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function reload() {
    const r = await fetch(`/api/admin/dealers/${dealerId}`, { cache: "no-store" });
    setDealer(await r.json());
    setLoading(false);
  }

  useEffect(() => { void reload(); }, [dealerId]);

  async function post(path: string, body?: unknown) {
    setActionLoading(true);
    setMessage("");
    const r = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    setActionLoading(false);
    if (!r.ok) {
      setMessage(data.error === "password_too_short" ? "הסיסמה חייבת להכיל לפחות 8 תווים" : "הפעולה נכשלה");
      return false;
    }
    await reload();
    router.refresh();
    return true;
  }

  async function approve() {
    if (!confirm("לאשר ולהפעיל את הסוחר? אם המייל לא אומת, הוא יאומת מנהלית.")) return;
    if (await post(`/api/admin/dealers/${dealerId}/approve`)) setMessage("הסוחר אושר והופעל");
  }

  async function reject() {
    if (!confirm("לדחות את הבקשה?")) return;
    if (await post(`/api/admin/dealers/${dealerId}/reject`, { reason: rejectReason })) setMessage("הבקשה נדחתה");
  }

  async function toggleFreeze() {
    const frozen = dealer?.verificationStatus === "VERIFIED";
    if (!confirm(frozen ? "להקפיא את הסוחר?" : "להפעיל מחדש את הסוחר?")) return;
    if (await post(`/api/admin/dealers/${dealerId}/freeze`, { frozen })) {
      setMessage(frozen ? "הסוחר הוקפא" : "הסוחר הופעל מחדש");
    }
  }

  async function verifyEmail() {
    if (await post(`/api/admin/dealers/${dealerId}/owner/verify-email`)) setMessage("המייל סומן כמאומת");
  }

  async function resetPassword() {
    if (password.length < 8) { setMessage("הסיסמה חייבת להכיל לפחות 8 תווים"); return; }
    if (!confirm("להחליף לבעל החשבון את הסיסמה?")) return;
    if (await post(`/api/admin/dealers/${dealerId}/owner/password`, { password })) {
      setPassword("");
      setMessage("הסיסמה הוחלפה");
    }
  }

  if (loading) return <SkeletonBlockV2 lines={4} />;
  if (!dealer?.id) return <p className="text-v2-text-secondary">סוחר לא נמצא</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-v2-warm">{dealer.businessName}</h1>
          <p className="text-sm text-v2-text-secondary">Dealer 360 · ניהול חשבון</p>
        </div>
        <Link href="/admin/dealers" className="text-sm text-v2-signal">חזרה לניהול סוחרים</Link>
      </div>

      {message && <Surface depth="raised" className="p-3 text-sm text-v2-text-primary">{message}</Surface>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Surface depth="raised" className="space-y-2 p-4">
          <h2 className="font-semibold text-v2-text-primary">פרטי העסק</h2>
          <p>איש קשר: {dealer.contactName}</p>
          <p>טלפון: {dealer.phone}</p>
          <p>עיר: {dealer.city ?? "—"}</p>
          <p>סטטוס: <strong>{dealer.verificationStatus}</strong></p>
          <p>גישה: <strong>{dealer.isActive && dealer.verificationStatus === "VERIFIED" ? "פעילה" : "לא פעילה"}</strong></p>
        </Surface>

        <Surface depth="raised" className="space-y-2 p-4">
          <h2 className="font-semibold text-v2-text-primary">משתמש בעלים</h2>
          <p>{dealer.owner?.name ?? "—"}</p>
          <p>{dealer.owner?.email ?? "—"}</p>
          <p>אימות מייל: <strong>{dealer.owner?.emailVerifiedAt ? "מאומת" : "לא אומת"}</strong></p>
          {!dealer.owner?.emailVerifiedAt && (
            <ButtonV2 variant="secondary" disabled={actionLoading} onClick={verifyEmail}>אמת מייל מנהלית</ButtonV2>
          )}
        </Surface>

        {dealer.metrics && (
          <Surface depth="raised" className="p-4 md:col-span-2">
            <h2 className="mb-3 font-semibold text-v2-text-primary">פעילות Exchange</h2>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <p>רכבים: {dealer.metrics.activeInventory}</p><p>חיפושים: {dealer.metrics.activeDemands}</p>
              <p>התאמות: {dealer.metrics.validatedMatches}</p><p>חיבורים: {dealer.metrics.reveals}</p>
              <p>תוצאות: {dealer.metrics.outcomes}</p><p>Push: {dealer.metrics.pushSubscriptions}</p>
            </div>
          </Surface>
        )}
      </div>

      <Surface depth="raised" className="space-y-4 p-4">
        <h2 className="font-semibold text-v2-text-primary">פעולות מנהל</h2>
        <div className="flex flex-wrap gap-3">
          {dealer.verificationStatus === "PENDING" && (
            <>
              <ButtonV2 variant="signal" disabled={actionLoading} onClick={approve}>אשר והפעל</ButtonV2>
              <ButtonV2 variant="secondary" disabled={actionLoading} onClick={() => setShowReject(!showReject)}>דחה בקשה</ButtonV2>
            </>
          )}
          {(dealer.verificationStatus === "VERIFIED" || dealer.verificationStatus === "DISABLED") && (
            <ButtonV2 variant="secondary" disabled={actionLoading} onClick={toggleFreeze}>
              {dealer.verificationStatus === "VERIFIED" ? "הקפא מנוי / גישה" : "הפעל מחדש"}
            </ButtonV2>
          )}
        </div>

        {showReject && (
          <div className="space-y-2">
            <textarea className="input min-h-[70px]" placeholder="סיבת דחייה (אופציונלי)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <ButtonV2 variant="secondary" disabled={actionLoading} onClick={reject}>אישור דחייה</ButtonV2>
          </div>
        )}

        {dealer.owner && (
          <div className="border-t border-white/10 pt-4">
            <p className="mb-2 text-sm font-medium text-v2-text-primary">הגדרת סיסמה חדשה</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className="input" type="password" minLength={8} placeholder="לפחות 8 תווים" value={password} onChange={(e) => setPassword(e.target.value)} />
              <ButtonV2 variant="secondary" disabled={actionLoading || password.length < 8} onClick={resetPassword}>החלף סיסמה</ButtonV2>
            </div>
          </div>
        )}
      </Surface>
    </div>
  );
}

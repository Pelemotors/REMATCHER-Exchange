"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { LoadingSpinner } from "@/components/ui/common";
import { COPY } from "@/config/brand";
import { ConnectionMotif } from "@/components/brand/brand-wordmark";
import { Phone, Copy, Check, MessageCircle } from "lucide-react";

const OUTCOME_OPTIONS = [
  { value: "DEAL_CLOSED", label: "נסגרה עסקה" },
  { value: "STILL_IN_PROGRESS", label: "עדיין בתהליך" },
  { value: "PRICE_DIDNT_WORK", label: "המחיר לא הסתדר" },
  { value: "VEHICLE_DIDNT_FIT", label: "הרכב לא התאים" },
  { value: "DID_NOT_PROGRESS", label: "לא התקדם" },
];

interface RevealData {
  id: string;
  revealedAt: string;
  isBuyer: boolean;
  counterparty: {
    businessName?: string;
    contactName?: string;
    phone?: string;
  };
  matchSummary?: {
    make?: string;
    model?: string;
    year?: number;
    b2bPrice?: number;
    explanation?: string;
  };
  outcome: { status: string } | null;
}

export default function RevealPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<RevealData | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/reveals/${params.id}`)
      .then((r) => {
        if (r.status === 403) {
          setForbidden(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setData(d);
        setLoading(false);
      });
  }, [params.id]);

  async function submitOutcome(status: string) {
    setSubmitting(true);
    await fetch(`/api/reveals/${params.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSubmitting(false);
    router.refresh();
    fetch(`/api/reveals/${params.id}`)
      .then((r) => r.json())
      .then(setData);
  }

  function copyPhone() {
    if (data?.counterparty.phone) {
      navigator.clipboard.writeText(data.counterparty.phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner label="טוען חיבור..." />
      </div>
    );
  }

  if (forbidden || !data) {
    return (
      <div className="card text-center">
        <p className="text-body text-text-secondary">לא ניתן לצפות בחיבור זה</p>
        <Link href="/activity" className="btn-primary mt-4 inline-block">
          חזרה לפעילות
        </Link>
      </div>
    );
  }

  const phone = data.counterparty.phone?.replace(/\D/g, "");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="reveal-hero card border border-signal/30 bg-surface text-center">
        <ConnectionMotif className="mb-4" />
        <h2 className="text-h1 font-bold text-ink">{COPY.revealHeadline}</h2>
        <p className="mt-2 text-body text-text-secondary">{COPY.revealSub}</p>
      </div>

      {data.matchSummary && (
        <div className="card">
          <p className="text-label text-text-muted">סיכום התאמה</p>
          <p className="mt-1 text-h3 font-semibold text-ink">
            {[data.matchSummary.make, data.matchSummary.model]
              .filter(Boolean)
              .join(" ")}{" "}
            {data.matchSummary.year}
          </p>
        </div>
      )}

      <div className="card space-y-4">
        <h3 className="text-h3 font-semibold text-ink">
          {data.isBuyer ? "פרטי המוכר" : "פרטי הקונה"}
        </h3>
        <div>
          <p className="text-label text-text-muted">עסק</p>
          <p className="font-medium text-ink">{data.counterparty.businessName}</p>
        </div>
        <div>
          <p className="text-label text-text-muted">איש קשר</p>
          <p className="font-medium text-ink">{data.counterparty.contactName}</p>
        </div>
        <div>
          <p className="text-label text-text-muted">טלפון</p>
          <p className="text-h2 font-bold text-ink" dir="ltr">
            {data.counterparty.phone}
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          {phone && (
            <>
              <a
                href={`tel:${phone}`}
                className="btn-primary flex flex-1 items-center justify-center gap-2"
              >
                <Phone className="h-4 w-4" strokeWidth={1.75} />
                התקשר
              </a>
              <a
                href={`https://wa.me/972${phone.replace(/^0/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary flex items-center gap-2 px-4"
                aria-label="WhatsApp"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
              </a>
              <button
                className="btn-secondary flex items-center gap-2 px-4"
                onClick={copyPhone}
                aria-label="העתק מספר"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-success" strokeWidth={1.75} />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.75} />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {!data.outcome ? (
        <div className="card space-y-4">
          <h3 className="text-h3 font-semibold text-ink">{COPY.outcome}</h3>
          <p className="text-small text-text-secondary">{COPY.outcomeBillingNote}</p>
          <div className="grid gap-2">
            {OUTCOME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="btn-secondary w-full justify-start text-right"
                disabled={submitting}
                onClick={() => submitOutcome(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="card text-center text-small text-text-secondary">
          תודה על העדכון — זה עוזר לנו לשפר התאמות
        </div>
      )}

      <Link href="/activity" className="btn-ghost block w-full text-center">
        חזרה לפעילות
      </Link>
    </div>
  );
}

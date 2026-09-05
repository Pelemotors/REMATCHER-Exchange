"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ButtonV2,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";
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
  const [showOutcome, setShowOutcome] = useState(false);

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
      <div className="mx-auto max-w-lg py-12">
        <SkeletonBlockV2 lines={6} />
      </div>
    );
  }

  if (forbidden || !data) {
    return (
      <Surface depth="raised" className="mx-auto max-w-lg p-6 text-center">
        <p className="text-body text-v2-text-secondary">לא ניתן לצפות בחיבור זה</p>
        <ButtonV2 variant="signal" href="/activity" className="mt-4">
          חזרה לפעילות
        </ButtonV2>
      </Surface>
    );
  }

  const phone = data.counterparty.phone?.replace(/\D/g, "");
  const waPhone = phone ? `972${phone.replace(/^0/, "")}` : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Surface
        depth="raised"
        className="reveal-hero border border-v2-signal/30 p-6 text-center"
      >
        <ConnectionMotif className="mb-4" />
        <h2 className="text-h1 font-bold text-v2-warm">נוצר חיבור</h2>
        <p className="mt-2 text-body text-v2-text-secondary">{COPY.revealSub}</p>
        <p className="mt-3 text-sm text-v2-text-muted">
          דברו ביניכם. נחזור אליך לעדכון בהמשך.
        </p>
      </Surface>

      {data.matchSummary && (
        <Surface depth="raised" className="p-4">
          <p className="text-label text-v2-text-muted">למה נוצר החיבור</p>
          <p className="mt-1 text-h3 font-semibold text-v2-warm">
            {[data.matchSummary.make, data.matchSummary.model]
              .filter(Boolean)
              .join(" ")}{" "}
            {data.matchSummary.year}
          </p>
          {data.matchSummary.explanation && (
            <p className="mt-2 text-sm text-v2-text-secondary">
              {data.matchSummary.explanation}
            </p>
          )}
        </Surface>
      )}

      <Surface depth="raised" className="space-y-4 p-4">
        <h3 className="text-h3 font-semibold text-v2-warm">
          {data.isBuyer ? "פרטי המוכר" : "פרטי הקונה"}
        </h3>
        <div>
          <p className="text-label text-v2-text-muted">עסק</p>
          <p className="font-medium text-v2-text-primary">{data.counterparty.businessName}</p>
        </div>
        <div>
          <p className="text-label text-v2-text-muted">איש קשר</p>
          <p className="font-medium text-v2-text-primary">{data.counterparty.contactName}</p>
        </div>
        <div>
          <p className="text-label text-v2-text-muted">טלפון</p>
          <p className="text-h2 font-bold text-v2-warm" dir="ltr">
            {data.counterparty.phone}
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {waPhone && (
            <a
              href={`https://wa.me/${waPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="v2-btn-signal flex w-full items-center justify-center gap-2"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
              פתח WhatsApp
            </a>
          )}
          {phone && (
            <div className="flex gap-2">
              <a
                href={`tel:${phone}`}
                className="v2-btn-secondary flex flex-1 items-center justify-center gap-2"
              >
                <Phone className="h-4 w-4" strokeWidth={1.75} />
                התקשר
              </a>
              <button
                type="button"
                className="v2-btn-secondary flex flex-1 items-center justify-center gap-2"
                onClick={copyPhone}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-success" strokeWidth={1.75} />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.75} />
                )}
                העתק מספר
              </button>
            </div>
          )}
        </div>
      </Surface>

      {!data.outcome ? (
        <Surface depth="secondary" className="space-y-3 p-4">
          {!showOutcome ? (
            <>
              <p className="text-sm text-v2-text-secondary">
                אחרי שתדברו — אפשר לעדכן מה קרה. אין לחץ לעשות את זה עכשיו.
              </p>
              <ButtonV2
                variant="ghost"
                className="w-full text-sm"
                onClick={() => setShowOutcome(true)}
              >
                עדכון תוצאה (אופציונלי)
              </ButtonV2>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-v2-text-primary">
                {COPY.outcome}
              </h3>
              <p className="text-small text-v2-text-secondary">
                {COPY.outcomeBillingNote}
              </p>
              <div className="grid gap-2">
                {OUTCOME_OPTIONS.map((opt) => (
                  <ButtonV2
                    key={opt.value}
                    variant="secondary"
                    className="w-full justify-start text-right"
                    disabled={submitting}
                    onClick={() => submitOutcome(opt.value)}
                  >
                    {opt.label}
                  </ButtonV2>
                ))}
              </div>
            </>
          )}
        </Surface>
      ) : (
        <Surface depth="raised" className="p-4 text-center text-small text-v2-text-secondary">
          תודה על העדכון — זה עוזר לנו לשפר התאמות
        </Surface>
      )}

      <ButtonV2 variant="ghost" href="/activity" className="block w-full text-center">
        חזרה לפעילות
      </ButtonV2>
    </div>
  );
}

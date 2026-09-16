"use client";

import { useState } from "react";
import {
  ButtonV2,
  PageHeaderV2,
  Surface,
} from "@/components/ui/brand-v2";

type IntelSnap = {
  ok: true;
  query: {
    make?: string | null;
    model?: string | null;
    yearMin?: number | null;
    yearMax?: number | null;
  };
  demand: {
    activeCount: number | null;
    highMatchEstimate: number | null;
    insufficientData: boolean;
  };
  supply: {
    activeCount: number | null;
    insufficientData: boolean;
  };
  myPrivate: {
    matchingDemandCount: number;
    matchingVehicleCount: number;
  };
  privacyNote: string;
};

/**
 * Network Intelligence — actionable, not analytics dashboard.
 */
export function NetworkIntelClient() {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<IntelSnap | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "network_intel",
          make: make.trim() || null,
          model: model.trim() || null,
          yearMin: yearMin ? parseInt(yearMin, 10) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError("לא ניתן לטעון מודיעין רשת");
        return;
      }
      setSnap(data as IntelSnap);
    } finally {
      setLoading(false);
    }
  }

  const titleBits = [make, model, yearMin].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-lg space-y-4 px-1 pb-10">
      <PageHeaderV2
        title="מה קורה ברשת?"
        subtitle="תמונה אנונימית בלבד — בלי זהויות סוחרים"
      />

      <Surface depth="raised" className="space-y-3 p-4">
        <label className="block space-y-1 text-sm">
          <span className="text-v2-text-muted">יצרן</span>
          <input
            className="input w-full"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="לדוגמה: Nissan"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-v2-text-muted">דגם</span>
          <input
            className="input w-full"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="לדוגמה: Qashqai"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-v2-text-muted">שנה מ־</span>
          <input
            className="input w-full"
            type="number"
            value={yearMin}
            onChange={(e) => setYearMin(e.target.value)}
            placeholder="2022"
          />
        </label>
        <ButtonV2
          variant="primary"
          className="w-full"
          disabled={loading || (!make.trim() && !model.trim())}
          onClick={() => void run()}
        >
          {loading ? "בודקים…" : "שאל את הרשת"}
        </ButtonV2>
        {error && (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        )}
      </Surface>

      {snap && (
        <Surface
          depth="raised"
          className="space-y-3 border border-[rgba(212,175,59,0.28)] p-4"
        >
          <p className="text-xs font-semibold tracking-wide text-v2-gold">
            תוצאה
          </p>
          <h2 className="text-lg font-bold text-v2-warm-white">
            {titleBits
              ? `מה הולך על ${titleBits}?`
              : "מודיעין רשת"}
          </h2>

          {snap.demand.insufficientData && snap.supply.insufficientData ? (
            <p className="text-sm text-v2-text-secondary">
              אין כרגע מספיק מידע ברשת כדי להציג תמונה אמינה.
            </p>
          ) : (
            <ul className="space-y-2 text-sm text-v2-text-primary">
              {!snap.demand.insufficientData && snap.demand.activeCount != null && (
                <li>
                  <span className="font-semibold text-v2-gold">
                    {snap.demand.activeCount}
                  </span>{" "}
                  חיפושים פעילים ברשת
                </li>
              )}
              {snap.demand.highMatchEstimate != null &&
                !snap.demand.insufficientData && (
                  <li>
                    <span className="font-semibold text-v2-signal">
                      {snap.demand.highMatchEstimate}
                    </span>{" "}
                    בהתאמה גבוהה (הערכה)
                  </li>
                )}
              {snap.demand.insufficientData && (
                <li className="text-v2-text-muted">
                  אין מספיק חיפושים ברשת להצגה אמינה.
                </li>
              )}
              {!snap.supply.insufficientData &&
                snap.supply.activeCount != null && (
                  <li>
                    <span className="font-semibold">{snap.supply.activeCount}</span>{" "}
                    רכבים פעילים ברשת
                  </li>
                )}
            </ul>
          )}

          <div className="rounded-xl border border-v2-border bg-v2-surface-secondary p-3 text-sm">
            <p className="font-medium text-v2-text-secondary">אצלך</p>
            <p className="mt-1 text-v2-text-primary">
              {snap.myPrivate.matchingDemandCount} חיפושים רלוונטיים ·{" "}
              {snap.myPrivate.matchingVehicleCount} רכבים רלוונטיים
            </p>
          </div>

          <p className="text-xs text-v2-text-muted">{snap.privacyNote}</p>
        </Surface>
      )}
    </div>
  );
}

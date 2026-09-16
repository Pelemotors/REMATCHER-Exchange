"use client";

import { useCallback, useEffect, useState } from "react";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";

type ReviewCandidate = {
  id: string;
  batchId: string;
  status: string;
  detectedPlate: string | null;
  plateNormalized: string | null;
  govState: string | null;
  existingVehicleId: string | null;
  media: Array<{
    id: string;
    categoryHint: string | null;
  }>;
};

export function IntakeReviewClient() {
  const [items, setItems] = useState<ReviewCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [plates, setPlates] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/intake/review");
      if (!res.ok) {
        setError("לא ניתן לטעון קליטות לסקירה");
        return;
      }
      const data = await res.json();
      const list = (data.candidates ?? []) as ReviewCandidate[];
      setItems(list);
      const next: Record<string, string> = {};
      for (const c of list) {
        next[c.id] = c.detectedPlate ?? c.plateNormalized ?? "";
      }
      setPlates(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(
    candidateId: string,
    body: Record<string, unknown>
  ) {
    setBusyId(candidateId);
    setError(null);
    try {
      const res = await fetch("/api/intake/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data.error !== "needs_confirmation") {
        setError(
          data.error === "gov_not_found"
            ? data.govState === "UNAVAILABLE"
              ? "ממשק המרשם לא זמין כרגע — נסו שוב בעוד רגע"
              : "לא מצאנו את הרכב במרשם — בדקו את המספר ושמרו שוב"
            : data.error === "invalid_plate"
              ? "מספר רישוי לא תקין"
              : "הפעולה נכשלה"
        );
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-5 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-v2-warm-white">סקירת קליטה</h1>
        <ButtonV2 variant="ghost" href="/intake/handoff">
          קליטה חדשה
        </ButtonV2>
      </div>
      <p className="text-sm text-v2-text-secondary">
        רק מועמדים שדורשים השלמה או אישור מופיעים כאן. השאר נכנס אוטומטית.
      </p>

      {loading && (
        <p className="text-sm text-v2-text-muted" role="status">
          טוען…
        </p>
      )}
      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
      {!loading && items.length === 0 && (
        <Surface depth="raised" className="p-4 text-sm text-v2-text-muted">
          אין קליטות ממתינות.{" "}
          <a className="underline" href="/inventory">
            למלאי
          </a>
        </Surface>
      )}

      {items.map((c) => (
        <Surface key={c.id} depth="raised" className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-v2-warm-white">
              {c.status === "NEEDS_CONFIRMATION"
                ? "רכב קיים במלאי"
                : c.plateNormalized || plates[c.id]
                  ? "נדרש אישור זיהוי מול המרשם"
                  : "חסר מספר רישוי / זיהוי"}
            </span>
            <span className="text-v2-text-muted">{c.media.length} תמונות</span>
          </div>

          {c.status === "NEEDS_CONFIRMATION" && c.existingVehicleId ? (
            <div className="flex flex-col gap-2">
              <ButtonV2
                variant="primary"
                disabled={busyId === c.id}
                onClick={() =>
                  void resolve(c.id, {
                    confirmExistingVehicleId: c.existingVehicleId,
                  })
                }
              >
                צרף לרכב הקיים
              </ButtonV2>
              <ButtonV2
                variant="secondary"
                disabled={busyId === c.id}
                onClick={() =>
                  void resolve(c.id, { createNewDespiteExisting: true })
                }
              >
                צור רכב חדש
              </ButtonV2>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block space-y-1 text-sm">
                <span className="text-v2-text-muted">מספר רישוי</span>
                <input
                  className="w-full rounded-xl border border-v2-border bg-v2-surface px-3 py-2"
                  value={plates[c.id] ?? ""}
                  onChange={(e) =>
                    setPlates((p) => ({ ...p, [c.id]: e.target.value }))
                  }
                  placeholder="12-345-67"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {c.media.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="rounded-lg border border-v2-border px-2 py-1 text-xs"
                    onClick={() => {
                      const next =
                        m.categoryHint === "EXTERIOR"
                          ? "INTERIOR"
                          : "EXTERIOR";
                      void resolve(c.id, {
                        mediaCategories: [{ mediaId: m.id, category: next }],
                        detectedPlate: plates[c.id] || undefined,
                      });
                    }}
                  >
                    {m.categoryHint === "EXTERIOR"
                      ? "חוץ"
                      : m.categoryHint === "INTERIOR"
                        ? "פנים"
                        : "לא סווג"}{" "}
                    · לחץ להחלפה
                  </button>
                ))}
              </div>
              <ButtonV2
                variant="primary"
                className="w-full"
                disabled={busyId === c.id || !(plates[c.id] ?? "").trim()}
                onClick={() =>
                  void resolve(c.id, {
                    detectedPlate: plates[c.id],
                  })
                }
              >
                שמור ושלח למלאי
              </ButtonV2>
            </div>
          )}

          <ButtonV2
            variant="ghost"
            className="w-full"
            disabled={busyId === c.id}
            onClick={() => void resolve(c.id, { reject: true })}
          >
            דחה קליטה זו
          </ButtonV2>
        </Surface>
      ))}
    </div>
  );
}

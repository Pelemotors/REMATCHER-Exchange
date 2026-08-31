"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, LoadingSpinner } from "@/components/ui/common";
import { formatCurrency } from "@/lib/utils";
import type { ParsedDemand } from "@/lib/schemas/ai";
import { extractKnownNumber, extractKnownString } from "@/lib/schemas/ai";

export default function DemandPage() {
  const router = useRouter();
  const [step, setStep] = useState<"input" | "confirm">("input");
  const [rawText, setRawText] = useState(
    "מחפש CX-5 מ-22 ומעלה, עד 130, עדיפות מפואר, לא אדום"
  );
  const [loading, setLoading] = useState(false);
  const [demandId, setDemandId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedDemand | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, unknown>>({});

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/demands/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText }),
    });
    const data = await res.json();
    setDemandId(data.demandId);
    setParsed(data.parsed);
    setConfirmed({
      make: extractKnownString(data.parsed?.make),
      model: extractKnownString(data.parsed?.model),
      yearMin: extractKnownNumber(data.parsed?.yearMin),
      budgetMax: extractKnownNumber(data.parsed?.budgetMax),
      trimPreference: extractKnownString(data.parsed?.trimPreference),
      colorExclusions: data.parsed?.colorExclusions ?? [],
    });
    setStep("confirm");
    setLoading(false);
  }

  async function handleConfirm() {
    setLoading(true);
    await fetch("/api/demands/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demandId, confirmed }),
    });
    setLoading(false);
    router.push("/matches");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="יצירת ביקוש"
        subtitle="תאר מה אתה מחפש — המערכת תפרק ותאשר איתך"
      />

      {step === "input" && (
        <form onSubmit={handleParse} className="card space-y-4">
          <label className="label" htmlFor="demand">
            ביקוש בשפה טבעית
          </label>
          <textarea
            id="demand"
            className="input min-h-[120px]"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "מנתח..." : "נתח ביקוש (AI)"}
          </button>
        </form>
      )}

      {step === "confirm" && parsed && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <h3 className="font-semibold">אשר את הפירוש</h3>
            <p className="text-sm text-text-secondary">
              AI מציע — אתה מחליט. לא יווצר ביקוש פעיל עד אישורך.
            </p>

            <div className="space-y-3">
              <div>
                <label className="label">יצרן</label>
                <input
                  className="input"
                  value={String(confirmed.make ?? "")}
                  onChange={(e) =>
                    setConfirmed({ ...confirmed, make: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">דגם</label>
                <input
                  className="input"
                  value={String(confirmed.model ?? "")}
                  onChange={(e) =>
                    setConfirmed({ ...confirmed, model: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">שנתון מינימום</label>
                  <input
                    className="input"
                    type="number"
                    value={String(confirmed.yearMin ?? "")}
                    onChange={(e) =>
                      setConfirmed({
                        ...confirmed,
                        yearMin: parseInt(e.target.value, 10) || null,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">תקציב מקסימום</label>
                  <input
                    className="input"
                    type="number"
                    value={String(confirmed.budgetMax ?? "")}
                    onChange={(e) =>
                      setConfirmed({
                        ...confirmed,
                        budgetMax: parseInt(e.target.value, 10) || null,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {parsed.hardConstraints?.length > 0 && (
              <div>
                <p className="label">אילוצים קשיחים</p>
                <ul className="text-sm text-error">
                  {parsed.hardConstraints.map((c, i) => (
                    <li key={i}>• {c.description}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.exclusions?.length > 0 && (
              <div>
                <p className="label">החרגות</p>
                <ul className="text-sm text-warning">
                  {parsed.exclusions.map((c, i) => (
                    <li key={i}>• {c.description}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.ambiguities?.length > 0 && (
              <div className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
                {parsed.ambiguities.map((a, i) => (
                  <p key={i}>⚠ {a}</p>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              className="btn-primary flex-1"
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? "יוצר..." : "אשר וחפש התאמות"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setStep("input")}
            >
              חזור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

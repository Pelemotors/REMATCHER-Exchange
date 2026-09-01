"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/common";
import type { ParsedDemand } from "@/lib/schemas/ai";
import { extractKnownNumber, extractKnownString } from "@/lib/schemas/ai";
import type { DuplicateCheckResult } from "@/services/demand/duplicate-detection";

interface Props {
  onCreated?: () => void;
  onCancel?: () => void;
}

export function CreateDemandFlow({ onCreated, onCancel }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"input" | "confirm" | "duplicate">("input");
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [demandId, setDemandId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedDemand | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, unknown>>({});
  const [duplicate, setDuplicate] = useState<DuplicateCheckResult | null>(null);

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setParseError(null);

    const res = await fetch("/api/demands/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText }),
    });

    if (!res.ok) {
      setParseError("לא הצלחנו לנתח את הבקשה. נסה שוב או ערוך את הניסוח.");
      setLoading(false);
      return;
    }

    const data = await res.json();
    setDemandId(data.demandId);
    setParsed(data.parsed);
    const confirmedData = {
      make: extractKnownString(data.parsed?.make),
      model: extractKnownString(data.parsed?.model),
      yearMin: extractKnownNumber(data.parsed?.yearMin),
      budgetMax: extractKnownNumber(data.parsed?.budgetMax),
      trimPreference: extractKnownString(data.parsed?.trimPreference),
      colorExclusions: data.parsed?.colorExclusions ?? [],
    };
    setConfirmed(confirmedData);

    const dupRes = await fetch("/api/demands/duplicate-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parsed: data.parsed }),
    });
    const dupData = await dupRes.json();
    if (dupData.level && dupData.level !== "DIFFERENT") {
      setDuplicate(dupData);
      setStep("duplicate");
      setLoading(false);
      return;
    }

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
    onCreated?.();
    router.push("/matches");
    router.refresh();
  }

  if (step === "input") {
    return (
      <form onSubmit={handleParse} className="card space-y-4">
        <div className="rounded-lg border border-signal/20 bg-signal-soft/50 px-4 py-3">
          <p className="text-sm font-medium text-ink">Exchange Assistant</p>
          <p className="mt-1 text-sm text-text-secondary">
            תאר בשפה טבעית מה אתה מחפש — נשקף לך את החיפוש לאישור לפני הפעלה.
          </p>
        </div>
        <label className="label" htmlFor="demand-input">
          מה אתה מחפש?
        </label>
        <textarea
          id="demand-input"
          className="input min-h-[120px]"
          placeholder="לדוגמה: מחפש מאזדה CX-5 מ-2022 ומעלה, תקציב עד 130,000, לא אדום"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          required
        />
        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={loading}>
            {loading ? "מנתח..." : "המשך לאישור"}
          </button>
          {onCancel && (
            <button type="button" className="btn-secondary" onClick={onCancel}>
              ביטול
            </button>
          )}
        </div>
        {parseError && <p className="text-sm text-error">{parseError}</p>}
      </form>
    );
  }

  if (step === "duplicate" && duplicate) {
    const isNearly = duplicate.level === "NEARLY_IDENTICAL";
    return (
      <div className="card space-y-4">
        <h3 className="font-semibold">
          {isNearly ? "יש לך כבר חיפוש פעיל כמעט זהה" : "יש לך חיפוש פעיל דומה"}
        </h3>
        {!isNearly && duplicate.differences.length > 0 && (
          <ul className="space-y-2 text-sm">
            {duplicate.differences.map((d) => (
              <li key={d.field}>
                <span className="text-text-muted">{d.field}:</span>{" "}
                {d.from} → {d.to}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              window.location.href = `/demand?edit=${duplicate.existingDemandId}`;
            }}
          >
            {isNearly ? "עבור לחיפוש הקיים" : "עדכן את הקיים"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setStep("confirm")}
          >
            פתח חיפוש נוסף
          </button>
          <button type="button" className="text-sm text-text-muted" onClick={() => setStep("input")}>
            חזור
          </button>
        </div>
      </div>
    );
  }

  if (!parsed) return null;

  const reflectionParts = [
    confirmed.make && confirmed.model
      ? `מחפש ${confirmed.make} ${confirmed.model}`
      : null,
    confirmed.yearMin ? `מ-${confirmed.yearMin} ומעלה` : null,
    confirmed.budgetMax
      ? `עד ${Number(confirmed.budgetMax).toLocaleString("he-IL")} ₪`
      : null,
    Array.isArray(confirmed.colorExclusions) && confirmed.colorExclusions.length > 0
      ? `ללא ${confirmed.colorExclusions.join(", ")}`
      : null,
  ].filter(Boolean);

  const reflectionText =
    reflectionParts.length > 0
      ? `${reflectionParts.join(" · ")}.`
      : "לא הצלחנו לחלץ פרטים מספיקים — ערוך ידנית לפני האישור.";

  return (
    <div className="space-y-4">
      <div className="card space-y-4 border-signal/30">
        <div className="rounded-lg border border-border bg-surface-secondary px-4 py-3">
          <p className="text-xs font-medium text-text-muted">מה שכתבת</p>
          <p className="mt-1 text-sm text-text-primary">&ldquo;{rawText}&rdquo;</p>
        </div>
        <div className="rounded-lg bg-signal-soft/50 px-4 py-3">
          <p className="text-sm font-medium text-ink">כך הבנו את החיפוש שלך</p>
          <p className="mt-2 text-body text-text-primary">{reflectionText}</p>
          {parsed.rawSummary && (
            <p className="mt-2 text-xs text-text-muted">{parsed.rawSummary}</p>
          )}
        </div>
        <p className="text-sm text-text-secondary">
          בדוק שהבנו נכון את החיפוש שלך. החיפוש יופעל רק לאחר אישורך.
        </p>

        <div className="space-y-3">
          <div>
            <label className="label">יצרן</label>
            <input
              className="input"
              value={String(confirmed.make ?? "")}
              onChange={(e) => setConfirmed({ ...confirmed, make: e.target.value })}
            />
          </div>
          <div>
            <label className="label">דגם</label>
            <input
              className="input"
              value={String(confirmed.model ?? "")}
              onChange={(e) => setConfirmed({ ...confirmed, model: e.target.value })}
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
      </div>

      <div className="flex gap-3">
        <button
          className="btn-primary flex-1"
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? "מפעיל..." : "אשר וחפש התאמות"}
        </button>
        <button className="btn-secondary" onClick={() => setStep("input")}>
          חזור
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";
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
      <form onSubmit={handleParse}>
        <Surface depth="raised" className="space-y-4 p-4">
          <Surface depth="secondary" className="border border-v2-signal/20 px-4 py-3">
            <p className="text-sm font-medium text-v2-text-primary">Exchange Assistant</p>
            <p className="mt-1 text-sm text-v2-text-secondary">
              תאר בשפה טבעית מה אתה מחפש — נשקף לך את החיפוש לאישור לפני הפעלה.
            </p>
          </Surface>
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
            <ButtonV2 type="submit" variant="signal" className="flex-1" disabled={loading}>
              {loading ? "מנתח..." : "המשך לאישור"}
            </ButtonV2>
            {onCancel && (
              <ButtonV2 variant="secondary" onClick={onCancel}>
                ביטול
              </ButtonV2>
            )}
          </div>
          {parseError && <p className="text-sm text-error">{parseError}</p>}
        </Surface>
      </form>
    );
  }

  if (step === "duplicate" && duplicate) {
    const isNearly = duplicate.level === "NEARLY_IDENTICAL";
    return (
      <Surface depth="raised" className="space-y-4 p-4">
        <h3 className="font-semibold text-v2-text-primary">
          {isNearly ? "יש לך כבר חיפוש פעיל כמעט זהה" : "יש לך חיפוש פעיל דומה"}
        </h3>
        {!isNearly && duplicate.differences.length > 0 && (
          <ul className="space-y-2 text-sm">
            {duplicate.differences.map((d) => (
              <li key={d.field}>
                <span className="text-v2-text-muted">{d.field}:</span>{" "}
                {d.from} → {d.to}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2">
          <ButtonV2
            variant="signal"
            onClick={() => {
              window.location.href = `/demand?edit=${duplicate.existingDemandId}`;
            }}
          >
            {isNearly ? "עבור לחיפוש הקיים" : "עדכן את הקיים"}
          </ButtonV2>
          <ButtonV2 variant="secondary" onClick={() => setStep("confirm")}>
            פתח חיפוש נוסף
          </ButtonV2>
          <button type="button" className="text-sm text-v2-text-muted" onClick={() => setStep("input")}>
            חזור
          </button>
        </div>
      </Surface>
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
      <Surface depth="raised" className="space-y-4 border border-v2-signal/30 p-4">
        <Surface depth="secondary" className="px-4 py-3">
          <p className="text-xs font-medium text-v2-text-muted">מה שכתבת</p>
          <p className="mt-1 text-sm text-v2-text-primary">&ldquo;{rawText}&rdquo;</p>
        </Surface>
        <Surface depth="secondary" className="bg-v2-signal-soft/30 px-4 py-3">
          <p className="text-sm font-medium text-v2-text-primary">כך הבנו את החיפוש שלך</p>
          <p className="mt-2 text-body text-v2-text-primary">{reflectionText}</p>
          {parsed.rawSummary && (
            <p className="mt-2 text-xs text-v2-text-muted">{parsed.rawSummary}</p>
          )}
        </Surface>
        <p className="text-sm text-v2-text-secondary">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      </Surface>

      <div className="flex gap-3">
        <ButtonV2
          variant="signal"
          className="flex-1"
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? "מפעיל..." : "אשר וחפש התאמות"}
        </ButtonV2>
        <ButtonV2 variant="secondary" onClick={() => setStep("input")}>
          חזור
        </ButtonV2>
      </div>
    </div>
  );
}

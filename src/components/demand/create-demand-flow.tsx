"use client";

import { useState } from "react";
import {
  ButtonV2,
  Surface,
} from "@/components/ui/brand-v2";
import type { ParsedDemand } from "@/lib/schemas/ai";
import { extractKnownNumber, extractKnownString } from "@/lib/schemas/ai";
import type { DuplicateCheckResult } from "@/services/demand/duplicate-detection";
import { EMPTY_COPY } from "@/lib/commercial-ux";
import { formatCurrency } from "@/lib/utils";

interface Props {
  onCreated?: () => void;
  onCancel?: () => void;
}

type EditField = "make" | "model" | "yearMin" | "budgetMax" | "color" | null;

export function CreateDemandFlow({ onCreated, onCancel }: Props) {
  const [step, setStep] = useState<"input" | "confirm" | "duplicate" | "done">(
    "input"
  );
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [demandId, setDemandId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedDemand | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, unknown>>({});
  const [duplicate, setDuplicate] = useState<DuplicateCheckResult | null>(null);
  const [editing, setEditing] = useState<EditField>(null);
  const [immediateMatchCount, setImmediateMatchCount] = useState(0);

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
    const res = await fetch("/api/demands/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demandId, confirmed }),
    });
    const data = await res.json();
    setLoading(false);
    setImmediateMatchCount(data.immediateMatchCount ?? 0);
    setStep("done");
    onCreated?.();
  }

  if (step === "done") {
    const title = [confirmed.make, confirmed.model].filter(Boolean).join(" ");
    return (
      <Surface depth="raised" className="space-y-4 border border-v2-signal/30 p-5">
        <p className="text-sm font-medium text-success">✓ {EMPTY_COPY.demandActivated.title}</p>
        <div>
          <h3 className="text-h3 font-bold text-v2-warm">{title || "החיפוש שלך"}</h3>
          <ul className="mt-2 space-y-1 text-sm text-v2-text-primary">
            {confirmed.yearMin != null && (
              <li>{String(confirmed.yearMin)} ומעלה</li>
            )}
            {confirmed.budgetMax != null && (
              <li>עד {formatCurrency(Number(confirmed.budgetMax))}</li>
            )}
            {Array.isArray(confirmed.colorExclusions) &&
              confirmed.colorExclusions.length > 0 && (
                <li>ללא {confirmed.colorExclusions.join(", ")}</li>
              )}
          </ul>
        </div>
        <p className="text-sm text-v2-text-secondary">{EMPTY_COPY.demandActivated.body}</p>

        {immediateMatchCount > 0 && (
          <Surface depth="secondary" className="border border-v2-signal/20 p-3">
            <p className="font-medium text-v2-signal">
              נמצאה התאמה כבר עכשיו
              {immediateMatchCount > 1 ? ` (${immediateMatchCount})` : ""}
            </p>
            <ButtonV2
              variant="signal"
              href="/matches?tab=action"
              className="mt-3 w-full"
            >
              צפה בהתאמה
            </ButtonV2>
          </Surface>
        )}

        <div className="flex flex-col gap-2">
          <ButtonV2
            variant={immediateMatchCount > 0 ? "secondary" : "signal"}
            href="/demand"
            className="w-full"
          >
            חזור לחיפושים
          </ButtonV2>
          <ButtonV2
            variant="secondary"
            className="w-full"
            onClick={() => {
              setStep("input");
              setRawText("");
              setParsed(null);
              setConfirmed({});
              setDemandId(null);
              setImmediateMatchCount(0);
              setEditing(null);
            }}
          >
            פתח חיפוש נוסף
          </ButtonV2>
        </div>
      </Surface>
    );
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

  const colors = Array.isArray(confirmed.colorExclusions)
    ? (confirmed.colorExclusions as string[])
    : [];

  return (
    <div className="space-y-4">
      <Surface depth="raised" className="space-y-4 border border-v2-signal/30 p-4">
        <Surface depth="secondary" className="px-4 py-3">
          <p className="text-xs font-medium text-v2-text-muted">מה שכתבת</p>
          <p className="mt-1 text-sm text-v2-text-primary">&ldquo;{rawText}&rdquo;</p>
        </Surface>

        <div>
          <p className="text-sm font-medium text-v2-text-primary">כך הבנתי:</p>
          <div className="mt-3 space-y-2">
            <p className="text-h3 font-bold text-v2-warm">
              {[confirmed.make, confirmed.model].filter(Boolean).join(" ") || "—"}
            </p>
            {confirmed.yearMin != null && (
              <p className="text-sm text-v2-text-primary">
                {String(confirmed.yearMin)} ומעלה
              </p>
            )}
            {confirmed.budgetMax != null && (
              <p className="text-sm text-v2-text-primary">
                עד {formatCurrency(Number(confirmed.budgetMax))}
              </p>
            )}
            {colors.length > 0 && (
              <p className="text-sm text-v2-text-primary">ללא {colors.join(", ")}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["yearMin", "ערוך שנתון"],
              ["budgetMax", "ערוך תקציב"],
              ["color", "ערוך צבע"],
              ["make", "ערוך יצרן"],
              ["model", "ערוך דגם"],
            ] as const
          ).map(([field, label]) => (
            <button
              key={field}
              type="button"
              onClick={() => setEditing(editing === field ? null : field)}
              className="rounded-lg bg-v2-surface-secondary px-3 py-1.5 text-sm text-v2-text-primary"
            >
              {label}
            </button>
          ))}
        </div>

        {editing === "make" && (
          <input
            className="input"
            value={String(confirmed.make ?? "")}
            onChange={(e) => setConfirmed({ ...confirmed, make: e.target.value })}
            placeholder="יצרן"
          />
        )}
        {editing === "model" && (
          <input
            className="input"
            value={String(confirmed.model ?? "")}
            onChange={(e) => setConfirmed({ ...confirmed, model: e.target.value })}
            placeholder="דגם"
          />
        )}
        {editing === "yearMin" && (
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
            placeholder="שנתון מינימום"
          />
        )}
        {editing === "budgetMax" && (
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
            placeholder="תקציב מקסימום"
          />
        )}
        {editing === "color" && (
          <input
            className="input"
            value={colors.join(", ")}
            onChange={(e) =>
              setConfirmed({
                ...confirmed,
                colorExclusions: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="צבעים להחריג (מופרדים בפסיק)"
          />
        )}

        <p className="text-sm text-v2-text-secondary">
          החיפוש יופעל רק לאחר אישורך.
        </p>
      </Surface>

      <div className="flex gap-3">
        <ButtonV2
          variant="signal"
          className="flex-1"
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? "מפעיל..." : "אשר והפעל חיפוש"}
        </ButtonV2>
        <ButtonV2 variant="secondary" onClick={() => setStep("input")}>
          חזור
        </ButtonV2>
      </div>
    </div>
  );
}

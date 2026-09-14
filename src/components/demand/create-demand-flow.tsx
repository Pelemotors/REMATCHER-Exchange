"use client";

import { useId, useRef, useState } from "react";
import {
  ButtonV2,
  Surface,
} from "@/components/ui/brand-v2";
import type { ParsedDemand } from "@/lib/schemas/ai";
import { extractKnownNumber, extractKnownString } from "@/lib/schemas/ai";
import type { DuplicateCheckResult } from "@/services/demand/duplicate-detection";
import { EMPTY_COPY } from "@/lib/commercial-ux";
import { cn, formatCurrency } from "@/lib/utils";
import styles from "./create-demand-flow.module.css";

export type CreateDemandFlowVariant = "default" | "home";

interface Props {
  onCreated?: () => void;
  onCancel?: () => void;
  /** `home` = Search-First composer; `default` = /demand create flow */
  variant?: CreateDemandFlowVariant;
}

type EditField = "make" | "model" | "yearMin" | "budgetMax" | "color" | null;

function buildConfirmedFromParsed(parsed: ParsedDemand | null) {
  return {
    make: extractKnownString(parsed?.make),
    model: extractKnownString(parsed?.model),
    yearMin: extractKnownNumber(parsed?.yearMin),
    budgetMax: extractKnownNumber(parsed?.budgetMax),
    trimPreference: extractKnownString(parsed?.trimPreference),
    colorExclusions: parsed?.colorExclusions ?? [],
  };
}

export function CreateDemandFlow({
  onCreated,
  onCancel,
  variant = "default",
}: Props) {
  const isHome = variant === "home";
  const inputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  const [homeEditing, setHomeEditing] = useState(false);
  const [immediateMatchCount, setImmediateMatchCount] = useState(0);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [pasteHint, setPasteHint] = useState<string | null>(null);

  function clearToInput() {
    setStep("input");
    setRawText("");
    setParsed(null);
    setConfirmed({});
    setDemandId(null);
    setImmediateMatchCount(0);
    setEditing(null);
    setHomeEditing(false);
    setDuplicate(null);
    setParseError(null);
    setConfirmError(null);
    setPasteHint(null);
  }

  async function handlePasteFromWhatsApp() {
    setPasteHint(null);
    try {
      if (!navigator.clipboard?.readText) {
        textareaRef.current?.focus();
        setPasteHint("הדבק כאן עם Ctrl/Cmd+V");
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        textareaRef.current?.focus();
        setPasteHint("הלוח ריק — העתק מהוואטסאפ והדבק כאן");
        return;
      }
      setRawText((prev) =>
        prev.trim() ? `${prev.trim()}\n${text.trim()}` : text.trim()
      );
      textareaRef.current?.focus();
    } catch {
      textareaRef.current?.focus();
      setPasteHint("לא ניתן לקרוא מהלוח — הדבק ידנית (Ctrl/Cmd+V)");
    }
  }

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
    setConfirmed(buildConfirmedFromParsed(data.parsed));
    setHomeEditing(false);
    setEditing(null);

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
    setConfirmError(null);
    try {
      const res = await fetch("/api/demands/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandId, confirmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConfirmError(
          typeof data.error === "string"
            ? data.error
            : "לא הצלחנו להפעיל את החיפוש. נסה שוב."
        );
        return;
      }
      setImmediateMatchCount(
        typeof data.immediateMatchCount === "number"
          ? data.immediateMatchCount
          : 0
      );
      setStep("done");
      onCreated?.();
    } catch {
      setConfirmError("לא הצלחנו להפעיל את החיפוש. נסה שוב.");
    } finally {
      setLoading(false);
    }
  }

  const colors = Array.isArray(confirmed.colorExclusions)
    ? (confirmed.colorExclusions as string[])
    : [];

  if (step === "done") {
    const title = [confirmed.make, confirmed.model].filter(Boolean).join(" ");
    const showImmediateMatches = !isHome && immediateMatchCount > 0;

    if (isHome) {
      return (
        <div className={cn(styles.panelLight, styles.successPanel)}>
          <p className={styles.successTitle}>החיפוש יצא לרשת</p>
          {title ? <p className={styles.successVehicle}>{title}</p> : null}
          <p className={styles.successBody}>
            REMATCHER מחפשת עכשיו מול המלאי ברשת.
            <br />
            נעדכן אותך כשנמצא משהו מתאים.
          </p>
          <div className={styles.actionsStack}>
            <ButtonV2 variant="signal" href="/demand" className={cn("w-full", styles.primaryCta)}>
              לחיפושים שלי
            </ButtonV2>
            <ButtonV2 variant="secondary" className="w-full" onClick={clearToInput}>
              חיפוש נוסף
            </ButtonV2>
          </div>
        </div>
      );
    }

    return (
      <Surface depth="raised" className="space-y-4 border border-v2-signal/30 p-5">
        <p className="text-sm font-medium text-success">
          ✓ {EMPTY_COPY.demandActivated.title}
        </p>
        <div>
          <h3 className="text-h3 font-bold text-v2-warm">{title || "החיפוש שלך"}</h3>
          <ul className="mt-2 space-y-1 text-sm text-v2-text-primary">
            {confirmed.yearMin != null && (
              <li>{String(confirmed.yearMin)} ומעלה</li>
            )}
            {confirmed.budgetMax != null && (
              <li>עד {formatCurrency(Number(confirmed.budgetMax))}</li>
            )}
            {colors.length > 0 && <li>ללא {colors.join(", ")}</li>}
          </ul>
        </div>
        <p className="text-sm text-v2-text-secondary">
          {EMPTY_COPY.demandActivated.body}
        </p>

        {showImmediateMatches && (
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
            variant={showImmediateMatches ? "secondary" : "signal"}
            href="/demand"
            className="w-full"
          >
            חזור לחיפושים
          </ButtonV2>
          <ButtonV2 variant="secondary" className="w-full" onClick={clearToInput}>
            פתח חיפוש נוסף
          </ButtonV2>
        </div>
      </Surface>
    );
  }

  if (step === "input") {
    if (isHome) {
      return (
        <form onSubmit={handleParse} className={styles.homeForm}>
          <label className={styles.srOnly} htmlFor={inputId}>
            תיאור החיפוש
          </label>
          <textarea
            ref={textareaRef}
            id={inputId}
            className={styles.homeTextarea}
            placeholder={"לדוגמה: מחפש קיה ספורטאז׳ 2022 עד 120 אלף"}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            required
            rows={5}
          />
          <div className={styles.secondaryActions}>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={handlePasteFromWhatsApp}
            >
              הדבק מוואטסאפ
            </button>
          </div>
          {pasteHint && <p className={styles.hint}>{pasteHint}</p>}
          <ButtonV2
            type="submit"
            variant="signal"
            className={cn("w-full", styles.primaryCta)}
            disabled={loading || !rawText.trim()}
          >
            {loading ? "מנתח..." : "חפש ברשת"}
          </ButtonV2>
          {parseError && <p className={styles.error}>{parseError}</p>}
        </form>
      );
    }

    return (
      <form onSubmit={handleParse}>
        <Surface depth="raised" className="space-y-4 p-4">
          <Surface
            depth="secondary"
            className="border border-v2-signal/20 px-4 py-3"
          >
            <p className="text-sm font-medium text-v2-text-primary">
              Exchange Assistant
            </p>
            <p className="mt-1 text-sm text-v2-text-secondary">
              תאר בשפה טבעית מה אתה מחפש — נשקף לך את החיפוש לאישור לפני הפעלה.
            </p>
          </Surface>
          <label className="label" htmlFor={inputId}>
            מה אתה מחפש?
          </label>
          <textarea
            id={inputId}
            className="input min-h-[120px]"
            placeholder="לדוגמה: מחפש מאזדה CX-5 מ-2022 ומעלה, תקציב עד 130,000, לא אדום"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            required
          />
          <div className="flex gap-3">
            <ButtonV2
              type="submit"
              variant="signal"
              className="flex-1"
              disabled={loading}
            >
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
      <Surface
        depth="raised"
        className={cn(isHome ? styles.panel : undefined, "space-y-4 p-4")}
      >
        <h3 className="font-semibold text-v2-text-primary">
          {isNearly
            ? "יש לך כבר חיפוש פעיל כמעט זהה"
            : "יש לך חיפוש פעיל דומה"}
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
          <button
            type="button"
            className="text-sm text-v2-text-muted"
            onClick={() => setStep("input")}
          >
            חזור
          </button>
        </div>
      </Surface>
    );
  }

  if (!parsed) return null;

  if (isHome) {
    return (
      <div className={styles.confirmWrap}>
        <div className={styles.panelLight}>
          <p className={styles.confirmTitle}>הבנתי, זה מה שחיפשת:</p>
          <div className={styles.rawQuote}>
            <p className={styles.rawQuoteText}>&ldquo;{rawText}&rdquo;</p>
          </div>
          <div className={styles.confirmSummary}>
            <p className={styles.confirmVehicle}>
              {[confirmed.make, confirmed.model].filter(Boolean).join(" ") ||
                "—"}
            </p>
            {confirmed.trimPreference != null &&
              String(confirmed.trimPreference) && (
                <p className={styles.confirmLine}>
                  גימור: {String(confirmed.trimPreference)}
                </p>
              )}
            {confirmed.yearMin != null && (
              <p className={styles.confirmLine}>
                {String(confirmed.yearMin)} ומעלה
              </p>
            )}
            {confirmed.budgetMax != null && (
              <p className={styles.confirmLine}>
                עד {formatCurrency(Number(confirmed.budgetMax))}
              </p>
            )}
            {colors.length > 0 && (
              <p className={styles.confirmLine}>ללא {colors.join(", ")}</p>
            )}
          </div>

          {homeEditing && (
            <div className={styles.editGrid}>
              <input
                className="input"
                value={String(confirmed.make ?? "")}
                onChange={(e) =>
                  setConfirmed({ ...confirmed, make: e.target.value })
                }
                placeholder="יצרן"
                aria-label="יצרן"
              />
              <input
                className="input"
                value={String(confirmed.model ?? "")}
                onChange={(e) =>
                  setConfirmed({ ...confirmed, model: e.target.value })
                }
                placeholder="דגם"
                aria-label="דגם"
              />
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
                aria-label="שנתון מינימום"
              />
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
                aria-label="תקציב מקסימום"
              />
              <input
                className="input"
                value={String(confirmed.trimPreference ?? "")}
                onChange={(e) =>
                  setConfirmed({
                    ...confirmed,
                    trimPreference: e.target.value || null,
                  })
                }
                placeholder="גימור / רמת אבזור"
                aria-label="גימור"
              />
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
                aria-label="צבעים להחריג"
              />
            </div>
          )}
          {confirmError && <p className={styles.error}>{confirmError}</p>}
        </div>

        <div className={styles.actionsStack}>
          <ButtonV2
            variant="signal"
            className={cn("w-full", styles.primaryCta)}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "שולח לרשת..." : "חפש ברשת"}
          </ButtonV2>
          <ButtonV2
            variant="secondary"
            className="w-full"
            onClick={() => setHomeEditing((v) => !v)}
          >
            {homeEditing ? "סיום עריכה" : "ערוך חיפוש"}
          </ButtonV2>
          <button
            type="button"
            className={styles.textBack}
            onClick={() => setStep("input")}
          >
            חזור
          </button>
        </div>
      </div>
    );
  }

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
              {[confirmed.make, confirmed.model].filter(Boolean).join(" ") ||
                "—"}
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
              <p className="text-sm text-v2-text-primary">
                ללא {colors.join(", ")}
              </p>
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
            onChange={(e) =>
              setConfirmed({ ...confirmed, make: e.target.value })
            }
            placeholder="יצרן"
          />
        )}
        {editing === "model" && (
          <input
            className="input"
            value={String(confirmed.model ?? "")}
            onChange={(e) =>
              setConfirmed({ ...confirmed, model: e.target.value })
            }
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
        {confirmError && <p className="text-sm text-error">{confirmError}</p>}
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

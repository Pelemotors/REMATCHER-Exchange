"use client";

import { useId, useRef, useState } from "react";
import {
  ButtonV2,
  Surface,
} from "@/components/ui/brand-v2";
import { UnderstandingResult } from "@/components/capture/understanding-result";
import type { ParsedDemand } from "@/lib/schemas/ai";
import { extractKnownNumber, extractKnownString } from "@/lib/schemas/ai";
import type { DuplicateCheckResult } from "@/services/demand/duplicate-detection";
import { EMPTY_COPY } from "@/lib/commercial-ux";
import { cn, formatCurrency } from "@/lib/utils";
import {
  mergePastedTranscript,
  normalizeWhatsAppTranscript,
} from "@/lib/whatsapp-transcript";
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
  const [customerHints, setCustomerHints] = useState<{
    name: string | null;
    phone: string | null;
    hybridHard?: boolean;
    hybridSoft?: boolean;
    semanticAlternative?: boolean;
  } | null>(null);
  const [publishOutcome, setPublishOutcome] = useState<"network" | "private">(
    "network"
  );
  const [savingPrivate, setSavingPrivate] = useState(false);

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
    setCustomerHints(null);
    setPublishOutcome("network");
    setSavingPrivate(false);
  }

  async function readClipboardText(): Promise<string | null> {
    try {
      const { Capacitor, registerPlugin } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const Clipboard = registerPlugin<{
          read(): Promise<{ value?: string }>;
        }>("Clipboard");
        const result = await Clipboard.read();
        if (typeof result?.value === "string") return result.value;
      }
    } catch {
      /* web / plugin missing — fall through */
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      return navigator.clipboard.readText();
    }
    return null;
  }

  function applyPastedText(incoming: string) {
    const next = normalizeWhatsAppTranscript(incoming);
    if (!next) return false;
    setRawText((prev) => mergePastedTranscript(prev, next));
    return true;
  }

  async function handlePasteFromWhatsApp() {
    setPasteHint(null);
    try {
      const text = await readClipboardText();
      if (text === null) {
        textareaRef.current?.focus();
        setPasteHint("הדבק כאן עם Cmd+V — אפשר כמה הודעות יחד");
        return;
      }
      if (!text.trim()) {
        textareaRef.current?.focus();
        setPasteHint("הלוח ריק — העתק מהוואטסאפ והדבק כאן");
        return;
      }
      applyPastedText(text);
      textareaRef.current?.focus();
    } catch {
      textareaRef.current?.focus();
      setPasteHint("לא ניתן לקרוא מהלוח — הדבק ידנית עם Cmd+V");
    }
  }

  function handleTextareaPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData("text/plain");
    if (!pasted.trim()) return;
    e.preventDefault();
    applyPastedText(pasted);
    setPasteHint(null);
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
    setCustomerHints(data.customerHints ?? null);
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

  async function handleConfirm(publishMode: "network" | "private" = "network") {
    if (publishMode === "private") setSavingPrivate(true);
    else setLoading(true);
    setConfirmError(null);
    try {
      const res = await fetch("/api/demands/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demandId,
          confirmed,
          publishMode,
          customer: customerHints
            ? { name: customerHints.name, phone: customerHints.phone }
            : undefined,
        }),
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
      setPublishOutcome(publishMode);
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
      setSavingPrivate(false);
    }
  }

  const colors = Array.isArray(confirmed.colorExclusions)
    ? (confirmed.colorExclusions as string[])
    : [];

  if (step === "done") {
    const title = [confirmed.make, confirmed.model].filter(Boolean).join(" ");
    const showImmediateMatches = !isHome && immediateMatchCount > 0;
    const isPrivate = publishOutcome === "private";

    if (isHome) {
      return (
        <div className={cn(styles.panelLight, styles.successPanel)}>
          <p className={styles.successTitle}>
            {isPrivate ? "נשמר פרטי" : "החיפוש יצא לרשת"}
          </p>
          {title ? <p className={styles.successVehicle}>{title}</p> : null}
          <p className={styles.successBody}>
            {isPrivate ? (
              <>
                החיפוש נשמר אצלך בלבד.
                <br />
                אפשר להפעיל ברשת מאוחר יותר ממסך החיפושים.
              </>
            ) : (
              <>
                REMATCHER מחפשת עכשיו מול המלאי ברשת.
                <br />
                נעדכן אותך כשנמצא משהו מתאים.
              </>
            )}
          </p>
          <div className={styles.actionsStack}>
            <ButtonV2 variant="signal" href="/demand" className={cn("w-full", styles.primaryCta)}>
              לחיפושים שלי
            </ButtonV2>
            <ButtonV2 variant="secondary" href="/customers" className="w-full">
              ללקוחות
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
            onPaste={handleTextareaPaste}
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

  const hybridPref = customerHints?.hybridHard
    ? "היברידי בלבד"
    : customerHints?.hybridSoft
      ? "עדיפות להיברידי"
      : null;

  const editFields = (
    <>
      <input
        className="input"
        value={String(confirmed.make ?? "")}
        onChange={(e) => setConfirmed({ ...confirmed, make: e.target.value })}
        placeholder="יצרן"
        aria-label="יצרן"
      />
      <input
        className="input"
        value={String(confirmed.model ?? "")}
        onChange={(e) => setConfirmed({ ...confirmed, model: e.target.value })}
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
    </>
  );

  return (
    <UnderstandingResult
      customer={{
        name: customerHints?.name ?? null,
        phone: customerHints?.phone ?? null,
      }}
      demand={{
        make: confirmed.make != null ? String(confirmed.make) : null,
        model: confirmed.model != null ? String(confirmed.model) : null,
        yearMin:
          confirmed.yearMin != null ? Number(confirmed.yearMin) : null,
        budgetMax:
          confirmed.budgetMax != null ? Number(confirmed.budgetMax) : null,
        trimPreference:
          confirmed.trimPreference != null
            ? String(confirmed.trimPreference)
            : null,
        colorExclusions: colors,
        hybridPref,
        similarOk: Boolean(customerHints?.semanticAlternative),
      }}
      editing={isHome ? homeEditing : editing != null}
      onToggleEdit={() => {
        if (isHome) setHomeEditing((v) => !v);
        else setEditing(editing ? null : "make");
      }}
      editSlot={editFields}
      primaryLoading={loading}
      secondaryLoading={savingPrivate}
      onPrimary={() => void handleConfirm("network")}
      onSecondary={() => void handleConfirm("private")}
      onBack={() => setStep("input")}
      error={confirmError}
    />
  );
}

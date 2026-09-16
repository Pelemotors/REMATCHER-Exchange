"use client";

import type { ReactNode } from "react";
import { ButtonV2 } from "@/components/ui/brand-v2";
import { formatCurrency, cn } from "@/lib/utils";
import styles from "./understanding-result.module.css";

export type UnderstandingCustomer = {
  name: string | null;
  phone: string | null;
};

export type UnderstandingDemandSummary = {
  make?: string | null;
  model?: string | null;
  yearMin?: number | null;
  budgetMax?: number | null;
  trimPreference?: string | null;
  colorExclusions?: string[];
  hybridPref?: string | null;
  similarOk?: boolean;
};

export type UnderstandingRelatedTrade = {
  summary: string;
};

export type UnderstandingResultProps = {
  customer?: UnderstandingCustomer | null;
  demand: UnderstandingDemandSummary;
  relatedTrade?: UnderstandingRelatedTrade | null;
  editing?: boolean;
  onToggleEdit?: () => void;
  editSlot?: ReactNode;
  primaryLabel?: string;
  primaryLoading?: boolean;
  onPrimary: () => void;
  secondaryLabel?: string;
  secondaryLoading?: boolean;
  onSecondary?: () => void;
  onBack?: () => void;
  error?: string | null;
  className?: string;
};

/**
 * Understanding Result — shows what REMATCHER understood before any network publish.
 * Primary = activate network search; Secondary = keep private.
 */
export function UnderstandingResult({
  customer,
  demand,
  relatedTrade,
  editing,
  onToggleEdit,
  editSlot,
  primaryLabel = "הפעל חיפוש ברשת",
  primaryLoading,
  onPrimary,
  secondaryLabel = "שמור פרטי",
  secondaryLoading,
  onSecondary,
  onBack,
  error,
  className,
}: UnderstandingResultProps) {
  const title =
    [demand.make, demand.model].filter(Boolean).join(" ") ||
    "בקשת לקוח";
  const colors = demand.colorExclusions ?? [];

  return (
    <div className={cn(styles.wrap, className)}>
      <div className={styles.panel}>
        <p className={styles.eyebrow}>מה REMATCHER הבינה</p>
        <h2 className={styles.title}>תוצאת הבנה</h2>

        {customer?.name ? (
          <p className={styles.customerName}>{customer.name}</p>
        ) : (
          <p className={styles.customerName}>לקוח</p>
        )}
        {customer?.phone ? (
          <p className={styles.phone}>{customer.phone}</p>
        ) : (
          <p className={styles.hint}>אין מספר טלפון — אפשר להמשיך בלי</p>
        )}

        <p className={styles.sectionLabel}>מחפש</p>
        <p className={styles.vehicleLine}>
          {title}
          {demand.similarOk ? " / דומה" : ""}
        </p>
        {demand.yearMin != null && (
          <p className={styles.fact}>{demand.yearMin}+</p>
        )}
        {demand.budgetMax != null && (
          <p className={styles.fact}>
            עד {formatCurrency(Number(demand.budgetMax))}
          </p>
        )}
        {demand.trimPreference ? (
          <p className={styles.fact}>גימור: {demand.trimPreference}</p>
        ) : null}
        {demand.hybridPref ? (
          <p className={styles.fact}>{demand.hybridPref}</p>
        ) : null}
        {colors.length > 0 && (
          <p className={styles.fact}>ללא {colors.join(", ")}</p>
        )}

        {relatedTrade ? (
          <div className={styles.related}>
            <p className={styles.relatedTitle}>טרייד קשור (נפרד)</p>
            <p className={styles.relatedBody}>{relatedTrade.summary}</p>
          </div>
        ) : null}

        {editing && editSlot ? (
          <div className={styles.editGrid}>{editSlot}</div>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}
      </div>

      <div className={styles.actions}>
        <ButtonV2
          variant="primary"
          className="w-full"
          onClick={onPrimary}
          disabled={primaryLoading || secondaryLoading}
        >
          {primaryLoading ? "מפעיל…" : primaryLabel}
        </ButtonV2>
        {onSecondary ? (
          <ButtonV2
            variant="secondary"
            className="w-full"
            onClick={onSecondary}
            disabled={primaryLoading || secondaryLoading}
          >
            {secondaryLoading ? "שומר…" : secondaryLabel}
          </ButtonV2>
        ) : null}
        {onToggleEdit ? (
          <ButtonV2
            variant="ghost"
            className="w-full"
            onClick={onToggleEdit}
            disabled={primaryLoading || secondaryLoading}
          >
            {editing ? "סיום תיקון" : "תקן נקודתית"}
          </ButtonV2>
        ) : null}
        {onBack ? (
          <button type="button" className={styles.textBack} onClick={onBack}>
            חזור
          </button>
        ) : null}
      </div>
    </div>
  );
}

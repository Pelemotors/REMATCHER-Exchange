"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { EnrichedDemand } from "@/services/demand/demand-queries";

interface Props {
  demand: EnrichedDemand;
  onRenew?: (id: string) => void;
  onClose?: (id: string) => void;
  onEdit?: (id: string) => void;
  compact?: boolean;
}

export function DemandCard({
  demand,
  onRenew,
  onClose,
  onEdit,
  compact,
}: Props) {
  const isActive = ["ACTIVE", "EXPIRING", "PENDING_CONFIRMATION"].includes(
    demand.uxStatus
  );

  return (
    <div className={cn("card space-y-3", compact && "p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">{demand.title}</h3>
          {demand.subtitle && (
            <p className="text-sm text-text-secondary">{demand.subtitle}</p>
          )}
          {demand.tags.length > 0 && (
            <p className="mt-1 text-xs text-text-muted">
              {demand.tags.join(" · ")}
            </p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            demand.uxStatus === "EXPIRING"
              ? "bg-warning-soft text-warning"
              : isActive
                ? "bg-success-soft text-success"
                : "bg-surface-secondary text-text-muted"
          )}
        >
          {demand.statusLabel}
          {isActive && demand.daysLeft != null && demand.daysLeft > 0 && (
            <> · נותרו {demand.daysLeft} ימים</>
          )}
        </span>
      </div>

      {!compact && (
        <p className="rounded-lg bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
          {demand.reflection}
        </p>
      )}

      {demand.matchHint && (
        <p
          className={cn(
            "text-sm",
            demand.hasAuthorizedMatch ? "text-signal font-medium" : "text-text-muted"
          )}
        >
          {demand.matchHint}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {demand.hasAuthorizedMatch && (
          <Link href="/matches" className="btn-primary text-sm">
            צפה בהתאמה
          </Link>
        )}
        {isActive && onEdit && (
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => onEdit(demand.id)}
          >
            ערוך חיפוש
          </button>
        )}
        {demand.uxStatus === "EXPIRED" && onRenew && (
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={() => onRenew(demand.id)}
          >
            הפעל מחדש
          </button>
        )}
        {isActive && onClose && (
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => onClose(demand.id)}
          >
            סיים חיפוש
          </button>
        )}
      </div>
    </div>
  );
}

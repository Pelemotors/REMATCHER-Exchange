"use client";

import { cn } from "@/lib/utils";
import { BadgeV2, ButtonV2, Surface } from "@/components/ui/brand-v2";
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
    <Surface depth="raised" className={cn("space-y-3", compact ? "p-4" : "p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-v2-warm">{demand.title}</h3>
          {demand.subtitle && (
            <p className="text-sm text-v2-text-secondary">{demand.subtitle}</p>
          )}
          {demand.tags.length > 0 && (
            <p className="mt-1 text-xs text-v2-text-muted">
              {demand.tags.join(" · ")}
            </p>
          )}
        </div>
        <BadgeV2
          variant={
            demand.uxStatus === "EXPIRING"
              ? "warning"
              : isActive
                ? "success"
                : "neutral"
          }
        >
          {demand.statusLabel}
          {isActive && demand.daysLeft != null && demand.daysLeft > 0 && (
            <> · נותרו {demand.daysLeft} ימים</>
          )}
        </BadgeV2>
      </div>

      {!compact && (
        <Surface depth="secondary" className="px-3 py-2 text-sm text-v2-text-secondary">
          {demand.reflection}
        </Surface>
      )}

      {demand.matchHint && (
        <p
          className={cn(
            "text-sm",
            demand.hasAuthorizedMatch ? "font-medium text-v2-signal" : "text-v2-text-muted"
          )}
        >
          {demand.matchHint}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {demand.hasAuthorizedMatch && (
          <ButtonV2 variant="signal" href="/matches" className="text-sm">
            צפה בהתאמה
          </ButtonV2>
        )}
        {isActive && onEdit && (
          <ButtonV2
            variant="secondary"
            className="text-sm"
            onClick={() => onEdit(demand.id)}
          >
            ערוך חיפוש
          </ButtonV2>
        )}
        {demand.uxStatus === "EXPIRED" && onRenew && (
          <ButtonV2
            variant="signal"
            className="text-sm"
            onClick={() => onRenew(demand.id)}
          >
            הפעל מחדש
          </ButtonV2>
        )}
        {isActive && onClose && (
          <ButtonV2
            variant="secondary"
            className="text-sm"
            onClick={() => onClose(demand.id)}
          >
            סיים חיפוש
          </ButtonV2>
        )}
      </div>
    </Surface>
  );
}

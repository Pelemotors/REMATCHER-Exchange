"use client";

import { cn } from "@/lib/utils";
import { BadgeV2, ButtonV2, Surface } from "@/components/ui/brand-v2";
import type { EnrichedDemand } from "@/services/demand/demand-queries";
import { relativeDaysAgo } from "@/lib/commercial-ux";

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
  const activeDays = relativeDaysAgo(demand.createdAt);

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
              : demand.hasAuthorizedMatch
                ? "signal"
                : isActive
                  ? "success"
                  : "neutral"
          }
        >
          {demand.statusLabel}
        </BadgeV2>
      </div>

      {isActive && (
        <p className="text-xs text-v2-text-muted">
          {activeDays ? `פעיל ${activeDays}` : "פעיל"}
          {demand.daysLeft != null && demand.daysLeft > 0
            ? ` · נותרו ${demand.daysLeft} ימים`
            : ""}
        </p>
      )}

      {demand.hasAuthorizedMatch ? (
        <p className="text-sm font-medium text-v2-signal">
          {demand.authorizedMatchCount}{" "}
          {demand.authorizedMatchCount === 1 ? "התאמה" : "התאמות"}
          {" · "}
          דורשת פעולה
        </p>
      ) : demand.matchHint ? (
        <p className="text-sm text-v2-text-muted">{demand.matchHint}</p>
      ) : null}

      {!isActive && demand.authorizedMatchCount > 0 && (
        <p className="text-sm text-v2-text-secondary">
          {demand.authorizedMatchCount} התאמות נמצאו
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {demand.hasAuthorizedMatch && (
          <ButtonV2
            variant="signal"
            href="/matches?tab=action"
            className="text-sm"
          >
            צפה בהתאמות
          </ButtonV2>
        )}
        {isActive && onEdit && (
          <ButtonV2
            variant="secondary"
            className="text-sm"
            onClick={() => onEdit(demand.id)}
          >
            ערוך
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
            variant="ghost"
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

import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { COPY } from "@/config/brand";
import { ExchangeMark } from "@/components/brand/exchange-mark";
import { Surface } from "@/components/ui/brand-v2";
import { DataValue } from "@/components/ui/brand-v2/data-value";
import { Check, Minus, ShieldCheck } from "lucide-react";

export interface MatchCardV2Props {
  headline: string;
  summary: string;
  fits: string[];
  gaps: string[];
  vehicle: {
    make?: string | null;
    model?: string | null;
    year?: number | null;
    trim?: string | null;
    mileage?: number | null;
    color?: string | null;
    region?: string | null;
    ownershipHand?: number | null;
    b2bPrice?: number | null;
  };
  band?: "STRONG" | "ALTERNATIVE" | null;
  onInterested?: () => void;
  onReject?: () => void;
  loading?: boolean;
  showActions?: boolean;
}

function vehicleMetaLine(vehicle: MatchCardV2Props["vehicle"]) {
  const parts: string[] = [];
  if (vehicle.year) parts.push(String(vehicle.year));
  if (vehicle.mileage != null)
    parts.push(`${formatNumber(vehicle.mileage)} ק״מ`);
  if (vehicle.ownershipHand) parts.push(`יד ${vehicle.ownershipHand}`);
  if (vehicle.trim) parts.push(vehicle.trim);
  return parts.join(" · ");
}

export function MatchCardV2({
  headline,
  summary,
  fits,
  gaps,
  vehicle,
  band,
  onInterested,
  onReject,
  loading,
  showActions = true,
}: MatchCardV2Props) {
  const isStrong = band === "STRONG";
  const displayHeadline = isStrong
    ? COPY.matchStrong
    : headline || COPY.matchPossible;

  return (
    <Surface
      depth="raised"
      as="article"
      className={cn(
        "space-y-5 p-5",
        isStrong && "ring-1 ring-v2-signal/40"
      )}
    >
      {/* MATCH header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {isStrong ? (
            <ExchangeMark state="matched" size={32} />
          ) : (
            <ExchangeMark state="idle" size={32} />
          )}
          <div>
            <span
              className={cn(
                isStrong
                  ? "v2-badge-match"
                  : gaps.length > 0
                    ? "v2-badge-warning"
                    : "v2-badge-neutral"
              )}
            >
              {isStrong ? "MATCH" : displayHeadline}
            </span>
            {!isStrong && (
              <p className="mt-1 text-label text-v2-text-muted">
                {displayHeadline}
              </p>
            )}
          </div>
        </div>
        <DataValue size="sm" label="לסוחר">
          {formatCurrency(vehicle.b2bPrice)}
        </DataValue>
      </div>

      {/* Vehicle */}
      <div>
        <h3 className="text-h3 font-semibold text-v2-warm">
          {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "רכב"}
        </h3>
        <p className="mt-1 text-small text-v2-text-secondary">
          {vehicleMetaLine(vehicle)}
        </p>
      </div>

      {/* Why the match */}
      {summary && (
        <p className="text-body text-v2-text-secondary">{summary}</p>
      )}

      {fits.length > 0 && (
        <ul className="space-y-1.5 text-small text-v2-text-primary">
          {fits.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-success"
                strokeWidth={2}
              />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {gaps.length > 0 && (
        <ul className="space-y-1.5 text-small text-v2-text-secondary">
          {gaps.map((g) => (
            <li key={g} className="flex items-start gap-2">
              <Minus
                className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                strokeWidth={2}
              />
              <span>{g}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Privacy */}
      <div className="flex items-start gap-2 border-t border-v2-border pt-4 text-small text-v2-text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span>
          {COPY.verifiedDealer} · {COPY.privacyNote}
        </span>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="flex gap-3">
          <button
            className="v2-btn-signal flex-1"
            onClick={onInterested}
            disabled={loading}
          >
            {COPY.interested}
          </button>
          <button
            className="v2-btn-secondary flex-1"
            onClick={onReject}
            disabled={loading}
          >
            {COPY.notRelevant}
          </button>
        </div>
      )}
    </Surface>
  );
}

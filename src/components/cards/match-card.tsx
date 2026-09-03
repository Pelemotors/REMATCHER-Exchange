import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { COPY } from "@/config/brand";
import {
  BadgeV2,
  DataValue,
  StatusBadgeV2,
  Surface,
} from "@/components/ui/brand-v2";
import { Check, Minus, ShieldCheck } from "lucide-react";

interface MatchCardProps {
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

function vehicleMetaLine(vehicle: MatchCardProps["vehicle"]) {
  const parts: string[] = [];
  if (vehicle.year) parts.push(String(vehicle.year));
  if (vehicle.mileage != null)
    parts.push(`${formatNumber(vehicle.mileage)} ק״מ`);
  if (vehicle.ownershipHand) parts.push(`יד ${vehicle.ownershipHand}`);
  if (vehicle.trim) parts.push(vehicle.trim);
  return parts.join(" · ");
}

export function MatchCard({
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
}: MatchCardProps) {
  const isStrong = band === "STRONG";
  const displayHeadline = isStrong
    ? COPY.matchStrong
    : headline || COPY.matchPossible;

  return (
    <Surface
      depth="raised"
      as="article"
      className={cn(
        "space-y-4 p-4",
        isStrong && "border border-v2-signal/30",
        loading && "pointer-events-none opacity-65"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <StatusBadgeV2 band={band} />
          {!isStrong && displayHeadline !== COPY.matchPossible && (
            <BadgeV2 variant="neutral" className="mr-2">
              {displayHeadline}
            </BadgeV2>
          )}
          <h3 className="mt-2 text-h3 font-bold text-v2-warm">
            {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "רכב"}
          </h3>
          <p className="vehicle-meta mt-1 text-v2-text-secondary">{vehicleMetaLine(vehicle)}</p>
        </div>
        <div className="shrink-0 text-left">
          <DataValue size="sm" label="לסוחר">
            {formatCurrency(vehicle.b2bPrice)}
          </DataValue>
        </div>
      </div>

      {summary && (
        <p className="text-body text-v2-text-secondary">{summary}</p>
      )}

      {fits.length > 0 && (
        <ul className="space-y-1.5 text-small text-v2-text-primary">
          {fits.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      {gaps.length > 0 && (
        <ul className="space-y-1.5 text-small text-v2-text-secondary">
          {gaps.map((g) => (
            <li key={g} className="flex items-start gap-2">
              <Minus className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={2} />
              <span>{g}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2 rounded-sm bg-v2-surface-secondary px-3 py-2 text-small text-v2-text-secondary">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-v2-text-muted" strokeWidth={1.75} />
        <span>
          {COPY.verifiedDealer} · {COPY.privacyNote}
        </span>
      </div>

      {showActions && (
        <div className="flex gap-3 pt-1">
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

export function OpportunityCard({
  headline,
  summary,
  demandSummary,
  vehicleSummary,
  gaps,
  onInterested,
  onReject,
  loading,
}: {
  headline: string;
  summary: string;
  demandSummary: Record<string, unknown>;
  vehicleSummary: Record<string, unknown>;
  gaps: string[];
  onInterested?: () => void;
  onReject?: () => void;
  loading?: boolean;
}) {
  return (
    <Surface
      depth="raised"
      as="article"
      className={cn(
        "space-y-4 border border-v2-signal/30 p-4",
        loading && "pointer-events-none opacity-65"
      )}
    >
      <BadgeV2 variant="signal">{headline || "יש עניין ברכב שלך"}</BadgeV2>
      <div>
        <p className="text-label text-v2-text-muted">הרכב שלך</p>
        <h3 className="text-h3 font-bold text-v2-warm">
          {[vehicleSummary.make, vehicleSummary.model].filter(Boolean).join(" ")}{" "}
          {vehicleSummary.year ? String(vehicleSummary.year) : ""}
        </h3>
        <p className="mt-1 text-sm text-v2-text-secondary">
          הביקוש מתאים לרכב שלך
        </p>
      </div>

      <div>
        <p className="text-label text-v2-text-muted">סוג הביקוש</p>
        <p className="font-medium text-v2-text-primary">
          {String(demandSummary.make ?? "")}{" "}
          {String(demandSummary.model ?? "")}
        </p>
        <p className="vehicle-meta mt-1 text-v2-text-secondary">
          {[
            demandSummary.yearMin && `${demandSummary.yearMin} ומעלה`,
            demandSummary.trimPreference === "high_trim" && "עדיפות לגרסה מפוארת",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {summary && <p className="text-body text-v2-text-secondary">{summary}</p>}

      {gaps.map((g) => (
        <p key={g} className="flex items-start gap-2 text-small text-v2-text-secondary">
          <Minus className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={2} />
          {g}
        </p>
      ))}

      <div className="flex items-start gap-2 text-small text-v2-text-muted">
        <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {COPY.verifiedDealer} — {COPY.privacyNote}
      </div>

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
    </Surface>
  );
}

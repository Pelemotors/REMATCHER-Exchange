import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { COPY } from "@/config/brand";
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
    <article
      className={cn("card space-y-4", isStrong && "card-signal")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              isStrong ? "badge-signal" : gaps.length > 0 ? "badge-warning" : "badge-neutral"
            )}
          >
            {displayHeadline}
          </span>
          <h3 className="mt-2 text-h3 font-bold text-ink">
            {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "רכב"}
          </h3>
          <p className="vehicle-meta mt-1">{vehicleMetaLine(vehicle)}</p>
        </div>
        <div className="shrink-0 text-left">
          <p className="text-price">{formatCurrency(vehicle.b2bPrice)}</p>
          <p className="text-label text-text-muted">לסוחר</p>
        </div>
      </div>

      {summary && (
        <p className="text-body text-text-secondary">{summary}</p>
      )}

      {fits.length > 0 && (
        <ul className="space-y-1.5 text-small text-text-primary">
          {fits.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      {gaps.length > 0 && (
        <ul className="space-y-1.5 text-small text-text-secondary">
          {gaps.map((g) => (
            <li key={g} className="flex items-start gap-2">
              <Minus className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={2} />
              <span>{g}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2 rounded-sm bg-surface-secondary px-3 py-2 text-small text-text-secondary">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} />
        <span>
          {COPY.verifiedDealer} · {COPY.privacyNote}
        </span>
      </div>

      {showActions && (
        <div className="flex gap-3 pt-1">
          <button
            className="btn-primary flex-1"
            onClick={onInterested}
            disabled={loading}
          >
            {COPY.interested}
          </button>
          <button
            className="btn-secondary flex-1"
            onClick={onReject}
            disabled={loading}
          >
            {COPY.notRelevant}
          </button>
        </div>
      )}
    </article>
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
    <article className="card-signal space-y-4">
      <span className="badge-signal">{COPY.opportunity}</span>
      <div>
        <p className="text-label text-text-muted">מחפשים</p>
        <h3 className="text-h3 font-bold text-ink">
          {String(demandSummary.make ?? "")}{" "}
          {String(demandSummary.model ?? "")}
        </h3>
        <p className="vehicle-meta mt-1">
          {[
            demandSummary.yearMin && `${demandSummary.yearMin} ומעלה`,
            demandSummary.trimPreference === "high_trim" && "עדיפות לגרסה מפוארת",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="rounded-md bg-surface-secondary p-3">
        <p className="text-label text-text-muted">הרכב שלך</p>
        <p className="mt-1 font-semibold text-ink">
          {[vehicleSummary.make, vehicleSummary.model]
            .filter(Boolean)
            .join(" ")}{" "}
          {vehicleSummary.trim ? `· ${vehicleSummary.trim}` : ""}{" "}
          {vehicleSummary.year ? `· ${vehicleSummary.year}` : ""}
        </p>
        {headline && (
          <p className="mt-2 text-small font-semibold text-success">{headline}</p>
        )}
      </div>

      {summary && <p className="text-body text-text-secondary">{summary}</p>}

      {gaps.map((g) => (
        <p key={g} className="flex items-start gap-2 text-small text-text-secondary">
          <Minus className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={2} />
          {g}
        </p>
      ))}

      <div className="flex items-start gap-2 text-small text-text-muted">
        <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {COPY.verifiedDealer} — {COPY.privacyNote}
      </div>

      <div className="flex gap-3">
        <button
          className="btn-primary flex-1"
          onClick={onInterested}
          disabled={loading}
        >
          {COPY.interested}
        </button>
        <button
          className="btn-secondary flex-1"
          onClick={onReject}
          disabled={loading}
        >
          {COPY.notRelevant}
        </button>
      </div>
    </article>
  );
}

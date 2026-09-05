import { cn, formatNumber } from "@/lib/utils";
import { COPY } from "@/config/brand";
import {
  BadgeV2,
  StatusBadgeV2,
  Surface,
} from "@/components/ui/brand-v2";
import { Check, Minus, ShieldCheck } from "lucide-react";
import styles from "./match-card-v2.module.css";

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
  };
  band?: "STRONG" | "GOOD" | "ALTERNATIVE" | null;
  potential?: boolean;
  infoRequestOpen?: boolean;
  onInterested?: () => void;
  onRequestInfo?: () => void;
  onReject?: () => void;
  loading?: boolean;
  showActions?: boolean;
  waiting?: boolean;
  connected?: boolean;
  revealHref?: string;
}

function vehicleMetaLine(vehicle: MatchCardV2Props["vehicle"]) {
  const parts: string[] = [];
  if (vehicle.year) parts.push(String(vehicle.year));
  if (vehicle.mileage != null)
    parts.push(`${formatNumber(vehicle.mileage)} ק״מ`);
  if (vehicle.ownershipHand) parts.push(`יד ${vehicle.ownershipHand}`);
  if (vehicle.trim) parts.push(vehicle.trim);
  if (vehicle.color) parts.push(vehicle.color);
  if (vehicle.region) parts.push(vehicle.region);
  return parts.join(" · ");
}

export function MatchCardV2({
  headline,
  summary,
  fits,
  gaps,
  vehicle,
  band,
  potential,
  infoRequestOpen,
  onInterested,
  onRequestInfo,
  onReject,
  loading,
  showActions = true,
  waiting,
  connected,
  revealHref,
}: MatchCardV2Props) {
  const isStrong = band === "STRONG";
  const displayHeadline = potential
    ? "התאמה אפשרית — חסרים כמה פרטים"
    : headline || COPY.matchPossible;

  return (
    <Surface
      depth="raised"
      as="article"
      className={cn(
        styles.card,
        isStrong && styles.cardStrong,
        loading && styles.loadingOverlay,
      )}
    >
      {/* Vehicle first — primary hierarchy */}
      <div className={styles.header}>
        <div className={styles.vehicleBlock}>
          <h3 className={styles.vehicleTitle}>
            {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "רכב"}
          </h3>
          <p className="mt-1 text-small text-v2-text-secondary">
            {vehicleMetaLine(vehicle)}
          </p>
          <div className={cn(styles.metaRow, "mt-2")}>
            {potential ? (
              <BadgeV2 variant="warning">חסרים פרטים</BadgeV2>
            ) : (
              <StatusBadgeV2 band={band} />
            )}
            {!isStrong && !potential && displayHeadline !== COPY.matchPossible && (
              <BadgeV2 variant="neutral">{displayHeadline}</BadgeV2>
            )}
            {gaps.length > 0 && band !== "STRONG" && (
              <BadgeV2 variant="warning">פערים</BadgeV2>
            )}
          </div>
          {!potential && !waiting && !connected && showActions && (
            <p className="mt-2 text-sm font-medium text-v2-text-primary">
              {COPY.proceedQuestionBuyer}
            </p>
          )}
        </div>
      </div>

      {summary && <p className={styles.summary}>{summary}</p>}

      {fits.length > 0 && (
        <ul className={styles.fitList}>
          {fits.map((f) => (
            <li key={f} className="flex items-start gap-2 text-v2-text-primary">
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
        <ul className={styles.gapList}>
          {gaps.map((g) => (
            <li key={g} className="flex items-start gap-2 text-v2-text-secondary">
              <Minus
                className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                strokeWidth={2}
              />
              <span>{g}</span>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.privacy}>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span>
          {COPY.verifiedDealer} · {COPY.privacyNote}
        </span>
      </div>

      {connected && revealHref ? (
        <div className={styles.actions}>
          <a href={revealHref} className="v2-btn-signal flex-1 text-center">
            {COPY.contactDetailsCta}
          </a>
        </div>
      ) : waiting ? (
        <p className="rounded-sm bg-v2-surface-secondary px-3 py-2 text-sm text-v2-text-secondary">
          {COPY.waitingOtherSide}
        </p>
      ) : showActions ? (
        <div className={styles.actions}>
          {potential ? (
            <button
              className="v2-btn-signal flex-1"
              onClick={onRequestInfo}
              disabled={loading || infoRequestOpen}
              aria-busy={loading}
            >
              {loading
                ? "שולח..."
                : infoRequestOpen
                  ? "פרטים כבר התבקשו"
                  : "מעניין אותי — בקשו פרטים"}
            </button>
          ) : (
            <button
              className="v2-btn-signal flex-1"
              onClick={onInterested}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "שולח..." : COPY.interested}
            </button>
          )}
          <button
            className="v2-btn-secondary flex-1"
            onClick={onReject}
            disabled={loading}
          >
            {COPY.notRelevant}
          </button>
        </div>
      ) : null}
    </Surface>
  );
}

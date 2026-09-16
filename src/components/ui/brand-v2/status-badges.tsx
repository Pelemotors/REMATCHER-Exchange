import { cn } from "@/lib/utils";
import {
  relationshipLabelHe,
  relationshipTone,
} from "@/lib/vehicle-labels-he";

const TONES = {
  private: "bg-v2-surface-secondary text-v2-text-muted border border-v2-border",
  network: "bg-v2-gold-soft text-v2-gold border border-[rgba(212,175,59,0.35)]",
  owned: "bg-v2-signal-soft text-v2-signal border border-[rgba(46,104,247,0.3)]",
  offered: "bg-v2-surface-secondary text-v2-text-secondary border border-v2-border",
  trade: "bg-warning-soft text-warning border border-[rgba(224,138,30,0.3)]",
  sold: "bg-v2-surface-secondary text-v2-text-muted border border-v2-border",
  success: "bg-success-soft text-success border border-[rgba(34,160,107,0.3)]",
  error: "bg-error-soft text-error border border-[rgba(226,75,75,0.3)]",
  opportunity:
    "bg-warning-soft text-warning border border-[rgba(224,138,30,0.3)]",
} as const;

export type StatusBadgeTone = keyof typeof TONES;

const LABELS_HE: Partial<Record<StatusBadgeTone, string>> = {
  private: "פרטי",
  network: "ברשת",
  owned: "שלי",
  offered: "הוצע לי",
  trade: "טרייד",
  sold: "נמכר",
  success: "הצלחה",
  error: "שגיאה",
  opportunity: "הזדמנות",
};

export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusBadgeTone;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        TONES[tone],
        className
      )}
    >
      {label ?? LABELS_HE[tone] ?? tone}
    </span>
  );
}

export function VisibilityBadge({
  visibility,
}: {
  visibility: "PRIVATE" | "ANONYMOUS_NETWORK" | string;
}) {
  return (
    <StatusBadge
      tone={visibility === "ANONYMOUS_NETWORK" ? "network" : "private"}
      label={visibility === "ANONYMOUS_NETWORK" ? "פעיל ברשת" : "פרטי"}
    />
  );
}

export function RelationshipBadge({
  relationship,
}: {
  relationship: string;
}) {
  return (
    <StatusBadge
      tone={relationshipTone(relationship)}
      label={relationshipLabelHe(relationship)}
    />
  );
}

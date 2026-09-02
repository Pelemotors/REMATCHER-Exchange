import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "neutral"
  | "signal"
  | "match"
  | "warning"
  | "success";

const variantClass: Record<BadgeVariant, string> = {
  neutral: "v2-badge-neutral",
  signal: "v2-badge-match",
  match: "v2-badge-match",
  warning: "v2-badge-warning",
  success: "v2-badge-success",
};

export function BadgeV2({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span className={cn(variantClass[variant], className)}>{children}</span>
  );
}

import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

export function BrandWordmark({
  variant = "default",
  className,
}: {
  variant?: "default" | "light" | "compact";
  className?: string;
}) {
  const isLight = variant === "light";

  if (variant === "compact") {
    return (
      <span className={cn("font-bold uppercase tracking-wide", className)}>
        <span className={isLight ? "text-white" : "text-ink"}>
          {BRAND.parent}
        </span>
      </span>
    );
  }

  return (
    <div className={cn("leading-tight", className)}>
      <p
        className={cn(
          "text-label font-bold uppercase tracking-[0.12em]",
          isLight ? "text-white/80" : "text-text-muted"
        )}
      >
        {BRAND.parent}
      </p>
      <p
        className={cn(
          "text-h3 font-medium",
          isLight ? "text-white/90" : "text-text-secondary"
        )}
      >
        {BRAND.productShort}
      </p>
    </div>
  );
}

/** Visual motif: two signals → connection (§9, §12) */
export function ConnectionMotif({ className }: { className?: string }) {
  return (
    <div className={cn("connection-motif", className)} aria-hidden>
      <span className="connection-node" />
      <span className="connection-line" />
      <span className="connection-node" />
    </div>
  );
}

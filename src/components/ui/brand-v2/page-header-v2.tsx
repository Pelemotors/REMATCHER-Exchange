import { cn } from "@/lib/utils";

export function PageHeaderV2({
  eyebrow,
  title,
  subtitle,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-label text-v2-text-muted">{eyebrow}</p>
        )}
        <h1 className="mt-0.5 text-title font-semibold text-v2-warm">{title}</h1>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-body text-v2-text-secondary">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

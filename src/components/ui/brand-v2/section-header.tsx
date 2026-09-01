import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div>
        <h2 className="v2-section-title">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-small text-v2-text-secondary">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center py-12 text-center">
      <p className="text-h3 font-semibold text-ink">{title}</p>
      {description && (
        <p className="mt-2 max-w-sm text-body text-text-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function LoadingSpinner({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          "h-8 w-8 animate-spin rounded-full border-2 border-surface-secondary border-t-signal",
          className
        )}
        role="status"
        aria-label={label ?? "טוען"}
      />
      {label && (
        <p className="text-small text-text-secondary">{label}</p>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-h2 font-bold text-ink">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-body text-text-secondary">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function UsageProgress({
  used,
  total,
  primaryLabel,
  secondaryLabel,
}: {
  used: number;
  total: number;
  primaryLabel: string;
  secondaryLabel?: string;
}) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <p className="font-semibold text-ink">{primaryLabel}</p>
      {secondaryLabel && (
        <p className="text-small text-text-secondary">{secondaryLabel}</p>
      )}
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

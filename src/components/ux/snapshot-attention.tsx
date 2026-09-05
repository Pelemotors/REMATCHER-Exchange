"use client";

import Link from "next/link";
import {
  BadgeV2,
  SectionHeader,
  Surface,
} from "@/components/ui/brand-v2";
import { cn } from "@/lib/utils";

export type SnapshotMetric = {
  label: string;
  value: number | string;
  href?: string;
  emphasize?: boolean;
};

export function SnapshotBar({
  metrics,
  className,
}: {
  metrics: SnapshotMetric[];
  className?: string;
}) {
  if (metrics.length === 0) return null;
  return (
    <div
      className={cn(
        "mb-4 grid gap-2",
        metrics.length === 2 && "grid-cols-2",
        metrics.length === 3 && "grid-cols-3",
        metrics.length >= 4 && "grid-cols-2 sm:grid-cols-4",
        className
      )}
    >
      {metrics.map((m) => {
        const inner = (
          <Surface
            depth="secondary"
            className={cn(
              "px-3 py-3 text-center",
              m.emphasize && "border border-v2-signal/30"
            )}
          >
            <p
              className={cn(
                "text-xl font-semibold tabular-nums text-v2-warm",
                m.emphasize && "text-v2-signal"
              )}
            >
              {m.value}
            </p>
            <p className="mt-0.5 text-xs text-v2-text-secondary">{m.label}</p>
          </Surface>
        );
        return m.href ? (
          <Link key={m.label} href={m.href} className="block">
            {inner}
          </Link>
        ) : (
          <div key={m.label}>{inner}</div>
        );
      })}
    </div>
  );
}

export type AttentionItem = {
  id: string;
  title: string;
  body?: string;
  href: string;
  badge?: string;
  urgent?: boolean;
};

function attentionHref(item: AttentionItem): string {
  if (item.href !== "/validations") return item.href;
  return `/validations?focus=${encodeURIComponent(item.id)}`;
}

export function AttentionList({
  title = "דורש טיפול",
  items,
  emptyText,
}: {
  title?: string;
  items: AttentionItem[];
  emptyText?: string;
}) {
  if (items.length === 0) {
    if (!emptyText) return null;
    return (
      <Surface depth="secondary" className="mb-4 p-4">
        <p className="text-sm text-v2-text-secondary">{emptyText}</p>
      </Surface>
    );
  }

  return (
    <section className="mb-6">
      <SectionHeader title={title} />
      <div className="space-y-2">
        {items.map((item) => (
          <Link key={item.id} href={attentionHref(item)} className="block">
            <Surface depth="raised" className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-v2-text-primary">{item.title}</p>
                {item.body && (
                  <p className="mt-0.5 text-sm text-v2-text-secondary">{item.body}</p>
                )}
              </div>
              {item.badge && (
                <BadgeV2 variant={item.urgent ? "signal" : "warning"}>
                  {item.badge}
                </BadgeV2>
              )}
            </Surface>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function FilterPills({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "shrink-0 rounded-lg px-3 py-1.5 text-sm transition",
            value === o.id
              ? "bg-v2-signal text-white"
              : "bg-v2-surface-secondary text-v2-text-primary"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function WorkspaceSection({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      {title && <SectionHeader title={title} />}
      {children}
    </section>
  );
}

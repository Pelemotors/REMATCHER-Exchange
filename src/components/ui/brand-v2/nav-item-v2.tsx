"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function NavItemV2({
  href,
  label,
  icon: Icon,
  active,
  onClick,
  compact,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  const showPending = pending || active;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={(e) => {
        onClick?.();
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
          return;
        }
        if (active) return;
        setPending(true);
        // Immediate visual feedback; Link still handles navigation.
        // Soften perceived latency without blocking.
        startTransition(() => {
          router.prefetch(href);
        });
        // Clear pending if navigation is slow/cancelled (route change unmounts usually)
        window.setTimeout(() => setPending(false), 1200);
      }}
      className={cn(
        "flex items-center gap-3 rounded-md font-medium transition duration-normal",
        "active:opacity-80",
        compact
          ? "min-h-[52px] min-w-0 flex-1 flex-col justify-center gap-0.5 px-0.5 py-1.5 text-[0.625rem] leading-tight sm:text-[0.6875rem]"
          : "px-3 py-2.5 text-body",
        active || pending
          ? "bg-v2-signal/15 text-v2-signal"
          : "text-v2-text-secondary hover:bg-v2-surface-secondary hover:text-v2-text-primary",
        pending && !active && "opacity-90",
      )}
    >
      <Icon
        className={cn(compact ? "h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" : "h-5 w-5")}
        strokeWidth={showPending ? 2 : 1.75}
        aria-hidden
      />
      <span
        className={cn(
          compact && "max-w-full truncate whitespace-nowrap text-center",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

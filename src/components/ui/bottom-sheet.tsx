"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  desktopWidth?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
  desktopWidth = "md:w-[420px]",
}: BottomSheetProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        className="absolute inset-0 bg-v2-midnight/60"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute flex flex-col border border-v2-border bg-v2-surface-raised shadow-modal",
          "inset-x-0 bottom-0 h-[min(92dvh,100dvh)] max-h-[100dvh] rounded-t-xl",
          "md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-full md:rounded-none md:rounded-l-xl",
          desktopWidth,
          className
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-v2-border px-4 py-3">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-h3 font-semibold text-v2-warm"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="truncate text-xs text-v2-text-muted">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-sm p-2 text-v2-text-secondary hover:bg-v2-surface-secondary hover:text-v2-warm"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-v2-border bg-v2-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

const STEPS = [
  "קוראת את החומר",
  "מזהה רכב או לקוח",
  "משלימה פרטים",
  "בודקת התאמות",
] as const;

/**
 * Capture processing — short system state, not chain-of-thought.
 */
export function CaptureProcessingState({
  activeStep = 1,
  className,
}: {
  activeStep?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-6 px-6 py-10 text-center",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative grid place-items-center">
        <span
          className="absolute h-28 w-28 animate-pulse rounded-full bg-v2-signal-soft"
          aria-hidden
        />
        <BrandMark size={64} variant="gold" preferPng />
      </div>
      <div>
        <p className="text-lg font-bold text-v2-text-primary">מבינים את החומר…</p>
        <p className="mt-1 text-sm text-v2-text-muted">
          זה לוקח רגע — בלי להקליד מחדש.
        </p>
      </div>
      <ul className="w-full max-w-xs space-y-2 text-start">
        {STEPS.map((label, i) => {
          const done = i < activeStep;
          const current = i === activeStep;
          return (
            <li
              key={label}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
                done && "border-[rgba(34,160,107,0.35)] bg-success-soft text-success",
                current &&
                  "border-[rgba(46,104,247,0.4)] bg-v2-signal-soft text-v2-signal",
                !done &&
                  !current &&
                  "border-v2-border bg-v2-surface-raised text-v2-text-muted"
              )}
            >
              <span className="min-w-[1.25rem] font-bold">
                {done ? "✓" : current ? "…" : "·"}
              </span>
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

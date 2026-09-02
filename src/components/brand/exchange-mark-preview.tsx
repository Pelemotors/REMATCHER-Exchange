"use client";

import { useEffect, useState } from "react";
import { ExchangeMark } from "@/components/brand/exchange-mark";
import type { ExchangeMarkState } from "@/config/brand-v2";

const STATES: ExchangeMarkState[] = [
  "idle",
  "searching",
  "converging",
  "matched",
];

const STATE_LABELS: Record<ExchangeMarkState, string> = {
  idle: "Idle",
  searching: "Searching",
  converging: "Converging",
  matched: "Matched",
};

export function ExchangeMarkPreview() {
  const [state, setState] = useState<ExchangeMarkState>("idle");
  const [autoPlay, setAutoPlay] = useState(true);

  useEffect(() => {
    if (!autoPlay) return;

    const runCycle = () => {
      setState("idle");
      const t1 = window.setTimeout(() => setState("searching"), 1500);
      const t2 = window.setTimeout(() => setState("converging"), 4500);
      const t3 = window.setTimeout(() => setState("matched"), 5400);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
      };
    };

    let cleanup = runCycle();
    const interval = window.setInterval(() => {
      cleanup();
      cleanup = runCycle();
    }, 10000);

    return () => {
      cleanup();
      window.clearInterval(interval);
    };
  }, [autoPlay]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 py-12">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
          Visual Review — Exchange Mark v1
        </p>
        <h1 className="mt-2 text-xl font-medium text-white/80">
          {STATE_LABELS[state]}
        </h1>
      </div>

      <ExchangeMark state={state} size={560} decorative />

      <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setAutoPlay(false);
              setState(s);
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              state === s
                ? "bg-white/15 text-white"
                : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
            }`}
          >
            {STATE_LABELS[s]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAutoPlay((v) => !v)}
          className="rounded-md border border-white/15 px-4 py-2 text-sm text-white/60 hover:text-white/80"
        >
          {autoPlay ? "Pause cycle" : "Auto cycle"}
        </button>
      </div>

      <p className="mt-8 max-w-md text-center text-xs leading-relaxed text-white/35">
        Source: public/brand/rematcher-exchange-mark-v1.svg — geometry preserved.
        Only left-half, right-half, connection-diamond are animated.
      </p>
    </div>
  );
}

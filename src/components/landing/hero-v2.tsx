"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandV2Scope } from "@/components/ui/brand-v2";
import { HeroExchangeVisual } from "@/components/landing/hero-exchange-visual";
import { PublicHeaderV2 } from "@/components/public/public-header-v2";
import type { ExchangeMarkState } from "@/config/brand-v2";

export function HeroV2() {
  const [markState, setMarkState] = useState<ExchangeMarkState>("idle");

  useEffect(() => {
    const runCycle = () => {
      setMarkState("idle");
      const t1 = window.setTimeout(() => setMarkState("searching"), 1800);
      const t2 = window.setTimeout(() => setMarkState("converging"), 4800);
      const t3 = window.setTimeout(() => setMarkState("matched"), 5700);
      const t4 = window.setTimeout(() => setMarkState("idle"), 8200);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
        window.clearTimeout(t4);
      };
    };

    let cleanup = runCycle();
    const interval = window.setInterval(() => {
      cleanup();
      cleanup = runCycle();
    }, 11000);

    return () => {
      cleanup();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <BrandV2Scope>
      <section className="relative min-h-screen overflow-hidden bg-v2-midnight">
        <PublicHeaderV2 />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_42%_at_68%_48%,rgba(23,74,115,0.12),transparent_72%)]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-[1280px] items-center px-5 pb-12 pt-24 md:px-8 lg:px-12">
          <div
            className="grid w-full items-center gap-8 lg:grid-cols-[45fr_55fr] lg:gap-10"
            dir="ltr"
          >
            {/* Copy — 45% */}
            <div className="flex flex-col justify-center" dir="rtl">
              <h1 className="v2-hero-display">
                <span className="block text-v2-warm">מה שאתה מחפש</span>
                <span className="v2-hero-accent mt-1 block">
                  נמצא בטח ממש מעבר לפינה.
                </span>
              </h1>

              <p className="mt-7 max-w-md text-[1.0625rem] leading-[1.65] text-v2-text-secondary">
                ויש סוחר לידך שבטח מחפש בדיוק את הרכב שאתה רוצה להוציא מהמלאי.
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/signup" className="v2-btn-hero px-8 py-3.5">
                  הצטרפות ל-Exchange
                </Link>
                <Link href="/login" className="v2-btn-hero-ghost px-6 py-3.5">
                  כבר רשום? התחבר
                </Link>
              </div>
            </div>

            {/* Visual — 55%, mark is the hero */}
            <div className="relative flex min-h-[min(72vh,640px)] items-center justify-center">
              <HeroExchangeVisual markState={markState} />
            </div>
          </div>
        </div>
      </section>
    </BrandV2Scope>
  );
}

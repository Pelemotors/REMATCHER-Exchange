"use client";

import Link from "next/link";
import { BrandV2Scope } from "@/components/ui/brand-v2";
import { HeroExchangeVisual } from "@/components/landing/hero-exchange-visual";
import { PublicHeaderV2 } from "@/components/public/public-header-v2";
import styles from "./hero-v2.module.css";

export function HeroV2() {
  return (
    <BrandV2Scope>
      <section className={styles.heroSection}>
        <PublicHeaderV2 />
        <div className={styles.heroBg} aria-hidden />

        <div className={styles.heroInner}>
          <div className={styles.heroGrid} dir="ltr">
            <div className={styles.copyBlock} dir="rtl">
              <h1 className={styles.headline}>
                <span className="block text-v2-warm">מה שאתה מחפש</span>
                <span className={styles.headlineAccent}>
                  נמצא בטח ממש מעבר לפינה.
                </span>
              </h1>

              <p className={styles.supporting}>
                ויש סוחר לידך שבטח מחפש בדיוק את הרכב שאתה
                <span className={styles.supportingBreak}>
                  רוצה להוציא מהמלאי.
                </span>
              </p>
            </div>

            <div className={styles.visualCol}>
              <HeroExchangeVisual />
            </div>

            <div className={styles.ctaBlock} dir="rtl">
              <Link href="/signup" className={styles.ctaPrimary}>
                הצטרפות ל-Exchange
              </Link>
              <Link href="/login" className={styles.ctaSecondary}>
                כבר רשום? התחבר
              </Link>
            </div>
          </div>
        </div>
      </section>
    </BrandV2Scope>
  );
}

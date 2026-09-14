"use client";

import Link from "next/link";
import { CreateDemandFlow } from "@/components/demand/create-demand-flow";
import { ExchangeMark } from "@/components/brand/exchange-mark";
import { Surface } from "@/components/ui/brand-v2";
import { BRAND } from "@/config/brand";
import styles from "./home-v2.module.css";

export interface HomeV2ActionItem {
  href: string;
  label: string;
  count: number;
  urgent?: boolean;
}

export interface HomeV2SetupStatus {
  hasInventory: boolean;
  hasActiveDemand: boolean;
  pushEnabled: boolean;
  inventoryCount: number;
  activeDemandCount: number;
  shouldShowOnboarding: boolean;
}

export interface HomeV2Props {
  dealerName: string | null;
  /** Required / blocking actions only — not a dashboard queue */
  blockers: HomeV2ActionItem[];
  setupStatus: HomeV2SetupStatus;
}

export function HomeV2({ dealerName, blockers, setupStatus }: HomeV2Props) {
  const urgentBlockers = blockers.filter((b) => b.urgent);
  const showInventoryHint =
    !setupStatus.hasInventory && urgentBlockers.length === 0;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.brandRow}>
          <ExchangeMark
            state="idle"
            variant="full"
            size={40}
            className={styles.mark}
            decorative
          />
          <p className={styles.brandLabel}>
            {dealerName ?? BRAND.product}
          </p>
        </div>
        <h1 className={styles.title}>יש לך לקוח שמחפש רכב?</h1>
        <p className={styles.subtitle}>
          זרוק את החיפוש כאן.
          <br />
          אנחנו נחפש ברשת.
        </p>
      </header>

      {urgentBlockers.length > 0 && (
        <div className={styles.notices} role="status">
          {urgentBlockers.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={styles.notice}
            >
              <Surface depth="raised" className={styles.noticeInner}>
                <span className={styles.noticeLabel}>{item.label}</span>
                {item.count > 1 && (
                  <span className={styles.noticeCount}>{item.count}</span>
                )}
              </Surface>
            </Link>
          ))}
        </div>
      )}

      {showInventoryHint && (
        <p className={styles.softHint}>
          אפשר להתחיל בחיפוש עכשיו.{" "}
          <Link href="/inventory" className={styles.softHintLink}>
            להוספת מלאי
          </Link>
        </p>
      )}

      <section className={styles.composer} aria-label="חיפוש ברשת">
        <CreateDemandFlow variant="home" />
      </section>
    </div>
  );
}

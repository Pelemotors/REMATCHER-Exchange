"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BadgeV2,
  ButtonV2,
  DataValue,
  PageHeaderV2,
  SectionHeader,
  Surface,
} from "@/components/ui/brand-v2";
import { ActiveSearchesSheet } from "@/components/demand/active-searches-sheet";
import { HomeSetupPanel } from "@/components/home/home-setup-panel";
import { formatRelative } from "@/lib/utils";
import { BRAND } from "@/config/brand";
import { ChevronLeft } from "lucide-react";
import styles from "./home-v2.module.css";

export interface HomeV2ActionItem {
  href: string;
  label: string;
  count: number;
  urgent?: boolean;
}

export interface HomeV2Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: Date;
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
  userName: string;
  dealerName: string | null;
  actionItems: HomeV2ActionItem[];
  activeDemands: number;
  inventoryCount: number;
  matches: number;
  opportunities: number;
  pendingOutcomes: number;
  connectionsLabel: string;
  connectionsSecondary: string;
  notifications: HomeV2Notification[];
  setupStatus: HomeV2SetupStatus;
}

export function HomeV2({
  userName,
  dealerName,
  actionItems,
  activeDemands,
  inventoryCount,
  matches,
  opportunities,
  pendingOutcomes,
  connectionsLabel,
  connectionsSecondary,
  notifications,
  setupStatus,
}: HomeV2Props) {
  const [searchesOpen, setSearchesOpen] = useState(false);
  const hasOpportunities = matches > 0 || opportunities > 0;
  const isColdStart = !setupStatus.hasInventory || !setupStatus.hasActiveDemand;

  return (
    <div className={styles.page}>
      <PageHeaderV2
        eyebrow={dealerName ?? BRAND.product}
        title={`שלום, ${userName}`}
        subtitle="מרכז העבודה — מה דורש טיפול עכשיו"
      />

      {!setupStatus.shouldShowOnboarding && (
        <HomeSetupPanel
          status={{
            hasInventory: setupStatus.hasInventory,
            hasActiveDemand: setupStatus.hasActiveDemand,
            pushEnabled: setupStatus.pushEnabled,
            inventoryCount,
            activeDemandCount: activeDemands,
          }}
        />
      )}

      {actionItems.length > 0 ? (
        <section>
          <SectionHeader title="דורש פעולה" />
          <div className={styles.actionList}>
            {actionItems.map((item) => (
              <Link key={`${item.href}-${item.label}`} href={item.href} className="block">
                <Surface depth="raised" className={styles.actionRow}>
                  <span className="font-medium text-v2-text-primary">
                    {item.label}
                  </span>
                  <BadgeV2 variant={item.urgent ? "signal" : "neutral"}>
                    {item.count}
                  </BadgeV2>
                </Surface>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <Surface depth="secondary" className={styles.idlePanel}>
          <div className="flex-1">
            <p className="font-medium text-v2-text-primary">
              {isColdStart ? "התחל להפעיל את הרשת" : "אין פעולות דחופות"}
            </p>
            <p className="mt-1 text-small text-v2-text-secondary">
              {isColdStart
                ? "הוסף מלאי או פתח חיפוש — REMATCHER יעבוד ברקע"
                : `${BRAND.parent} עובד ברקע`}
            </p>
            {isColdStart && (
              <div className={styles.idleActions}>
                {!setupStatus.hasInventory && (
                  <ButtonV2 variant="signal" href="/inventory" className="w-full sm:w-auto">
                    הוסף מלאי
                  </ButtonV2>
                )}
                {setupStatus.hasInventory && !setupStatus.hasActiveDemand && (
                  <ButtonV2 variant="signal" href="/demand?new=1" className="w-full sm:w-auto">
                    פתח חיפוש
                  </ButtonV2>
                )}
              </div>
            )}
          </div>
        </Surface>
      )}

      <section className={styles.opportunitySection}>
        <SectionHeader
          title="הזדמנויות"
          subtitle="התאמות ועניין ברכבים שלך"
        />
        <div className={styles.opportunityGrid}>
          <Link href="/matches" className="block">
            <Surface
              depth="raised"
              className={`${styles.opportunityCard} ${
                matches > 0 ? styles.opportunityCardStrong : ""
              }`}
            >
              <div className={styles.opportunityTop}>
                <span className="text-label text-v2-text-muted">
                  התאמות חדשות
                </span>
                {matches > 0 && <BadgeV2 variant="signal">חדש</BadgeV2>}
              </div>
              <p
                className={`${styles.opportunityValue} ${
                  matches > 0 ? styles.opportunityValueSignal : ""
                }`}
              >
                {matches}
              </p>
              {matches > 0 && (
                <p className="mt-2 text-small text-v2-signal">
                  יש התאמות שמחכות לך
                </p>
              )}
            </Surface>
          </Link>

          <Link href="/opportunities" className="block">
            <Surface
              depth="raised"
              className={`${styles.opportunityCard} ${
                opportunities > 0 ? styles.opportunityCardStrong : ""
              }`}
            >
              <div className={styles.opportunityTop}>
                <span className="text-label text-v2-text-muted">
                  עניין ברכבים שלך
                </span>
                {opportunities > 0 && (
                  <BadgeV2 variant="signal">חדש</BadgeV2>
                )}
              </div>
              <p
                className={`${styles.opportunityValue} ${
                  opportunities > 0 ? styles.opportunityValueSignal : ""
                }`}
              >
                {opportunities}
              </p>
              {opportunities > 0 && (
                <p className="mt-2 text-small text-v2-signal">
                  סוחרים מתעניינים ברכב שלך
                </p>
              )}
            </Surface>
          </Link>
        </div>

        {!hasOpportunities && (
          <p className="text-small text-v2-text-muted">
            כרגע אין הזדמנויות חדשות — הרשת ממשיכה לחפש
          </p>
        )}
      </section>

      {pendingOutcomes > 0 && (
        <section>
          <SectionHeader title="חיבורים" />
          <Link href="/activity?filter=outcomes" className="block">
            <Surface depth="raised" className={styles.actionRow}>
              <span className="font-medium text-v2-text-primary">
                עדכן תוצאה לחיבורים פתוחים
              </span>
              <BadgeV2 variant="signal">{pendingOutcomes}</BadgeV2>
            </Surface>
          </Link>
        </section>
      )}

      <section>
        <SectionHeader
          title="מה קרה"
          action={
            <Link
              href="/activity"
              className="flex items-center gap-1 text-small text-v2-signal"
            >
              הכל
              <ChevronLeft className="h-4 w-4" />
            </Link>
          }
        />
        {notifications.length > 0 ? (
          <div className={styles.activityList}>
            {notifications.map((n) => (
              <Link key={n.id} href={n.link ?? "/activity"} className="block">
                <Surface depth="base" className={styles.activityItem}>
                  <p className="font-medium text-v2-text-primary">{n.title}</p>
                  {n.body && (
                    <p className="mt-0.5 text-small text-v2-text-secondary">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-1.5 text-label text-v2-text-muted">
                    {formatRelative(n.createdAt)}
                  </p>
                </Surface>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-small text-v2-text-muted">אין פעילות עדיין</p>
        )}
      </section>

      <section>
        <SectionHeader title="הרשת שלך" />
        <div className={styles.networkGrid}>
          <button
            type="button"
            onClick={() => setSearchesOpen(true)}
            className="text-start"
          >
            <Surface
              depth="secondary"
              className="px-4 py-4 transition hover:bg-v2-surface-raised"
            >
              <DataValue size="sm" label="חיפושים פעילים">
                {activeDemands}
              </DataValue>
            </Surface>
          </button>
          <Link href="/inventory">
            <Surface
              depth="secondary"
              className="px-4 py-4 transition hover:bg-v2-surface-raised"
            >
              <DataValue size="sm" label="רכבים במלאי">
                {inventoryCount}
              </DataValue>
            </Surface>
          </Link>
          <Link href="/account" className="md:col-span-2">
            <Surface
              depth="secondary"
              className="px-4 py-4 transition hover:bg-v2-surface-raised"
            >
              <p className="text-sm font-medium text-v2-text-primary">
                {connectionsLabel}
              </p>
              <p className="mt-1 text-label text-v2-text-muted">
                {connectionsSecondary}
              </p>
            </Surface>
          </Link>
        </div>
      </section>

      <ActiveSearchesSheet
        open={searchesOpen}
        onClose={() => setSearchesOpen(false)}
      />
    </div>
  );
}

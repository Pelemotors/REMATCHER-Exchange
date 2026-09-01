"use client";

import Link from "next/link";
import { useState } from "react";
import { ExchangeMark } from "@/components/brand/exchange-mark";
import {
  BrandV2Scope,
  DataValue,
  SectionHeader,
  Surface,
} from "@/components/ui/brand-v2";
import { ActiveSearchesSheet } from "@/components/demand/active-searches-sheet";
import { formatRelative } from "@/lib/utils";
import { BRAND } from "@/config/brand";
import { ChevronLeft } from "lucide-react";

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

export interface HomeV2Props {
  userName: string;
  dealerName: string | null;
  actionItems: HomeV2ActionItem[];
  activeDemands: number;
  matches: number;
  opportunities: number;
  connectionsLabel: string;
  connectionsSecondary: string;
  notifications: HomeV2Notification[];
}

export function HomeV2({
  userName,
  dealerName,
  actionItems,
  activeDemands,
  matches,
  opportunities,
  connectionsLabel,
  connectionsSecondary,
  notifications,
}: HomeV2Props) {
  const [searchesOpen, setSearchesOpen] = useState(false);
  const hasOpportunities = matches > 0 || opportunities > 0;

  return (
    <BrandV2Scope className="-mx-4 -mt-4 px-4 pt-4 md:-mx-6 md:px-6">
      {/* Page header */}
      <header className="mb-8">
        <p className="text-label text-v2-text-muted">{dealerName ?? BRAND.product}</p>
        <h1 className="mt-1 text-title font-semibold text-v2-warm">
          שלום, {userName}
        </h1>
      </header>

      {/* 1. Requires action */}
      {actionItems.length > 0 ? (
        <section className="mb-8">
          <SectionHeader title="דורש פעולה" />
          <div className="space-y-2">
            {actionItems.map((item) => (
              <Link key={item.href} href={item.href} className="block">
                <Surface
                  depth="raised"
                  className="flex items-center justify-between px-4 py-3.5 transition hover:bg-v2-surface-secondary"
                >
                  <span className="font-medium text-v2-text-primary">
                    {item.label}
                  </span>
                  <span
                    className={
                      item.urgent ? "v2-badge-match" : "v2-badge-neutral"
                    }
                  >
                    {item.count}
                  </span>
                </Surface>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <Surface depth="secondary" className="mb-8 flex items-center gap-4 px-5 py-6">
          <ExchangeMark state="idle" size={48} />
          <div>
            <p className="font-medium text-v2-text-primary">
              אין פעולות דחופות
            </p>
            <p className="mt-1 text-small text-v2-text-secondary">
              {BRAND.parent} עובד ברקע
            </p>
          </div>
        </Surface>
      )}

      {/* 2. Opportunities */}
      <section className="mb-8">
        <SectionHeader
          title="הזדמנויות"
          subtitle="התאמות ועניין ברכבים שלך"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/matches" className="block">
            <Surface
              depth="raised"
              className={`px-5 py-5 transition hover:bg-v2-surface-secondary ${
                matches > 0 ? "ring-1 ring-v2-signal/30" : ""
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-label text-v2-text-muted">התאמות חדשות</span>
                {matches > 0 && (
                  <ExchangeMark state="matched" size={28} />
                )}
              </div>
              <DataValue signal={matches > 0}>{matches}</DataValue>
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
              className={`px-5 py-5 transition hover:bg-v2-surface-secondary ${
                opportunities > 0 ? "ring-1 ring-v2-signal/30" : ""
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-label text-v2-text-muted">
                  עניין ברכבים שלך
                </span>
                {opportunities > 0 && (
                  <ExchangeMark state="converging" size={28} />
                )}
              </div>
              <DataValue signal={opportunities > 0}>{opportunities}</DataValue>
              {opportunities > 0 && (
                <p className="mt-2 text-small text-v2-signal">
                  סוחרים מתעניינים ברכב שלך
                </p>
              )}
            </Surface>
          </Link>
        </div>

        {!hasOpportunities && (
          <p className="mt-3 text-small text-v2-text-muted">
            כרגע אין הזדמנויות חדשות — הרשת ממשיכה לחפש
          </p>
        )}
      </section>

      {/* 3. Recent activity */}
      <section className="mb-8">
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
          <div className="space-y-2">
            {notifications.map((n) => (
              <Link key={n.id} href={n.link ?? "/activity"} className="block">
                <Surface
                  depth="base"
                  className="border border-v2-border px-4 py-3 transition hover:bg-v2-surface-secondary"
                >
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

      {/* 4. Network (quiet) */}
      <section>
        <SectionHeader title="הרשת שלך" />
        <div className="grid gap-3 sm:grid-cols-2">
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
          <Link href="/account">
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
    </BrandV2Scope>
  );
}

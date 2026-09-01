"use client";

import { useState } from "react";
import Link from "next/link";
import { ActiveSearchesSheet } from "@/components/demand/active-searches-sheet";

interface KpiProps {
  activeDemands: number;
  matches: number;
  opportunities: number;
  connectionsLabel: string;
  connectionsSecondary: string;
}

export function HomeKpiGrid({
  activeDemands,
  matches,
  opportunities,
  connectionsLabel,
  connectionsSecondary,
}: KpiProps) {
  const [searchesOpen, setSearchesOpen] = useState(false);

  return (
    <>
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <button
          type="button"
          onClick={() => setSearchesOpen(true)}
          className="card text-center transition hover:shadow-elevated"
        >
          <p className="text-2xl font-bold text-signal">{activeDemands}</p>
          <p className="text-xs text-text-secondary">חיפושים פעילים</p>
        </button>
        <Link href="/matches" className="card text-center transition hover:shadow-elevated">
          <p className="text-2xl font-bold">{matches}</p>
          <p className="text-xs text-text-secondary">התאמות חדשות</p>
        </Link>
        <Link href="/opportunities" className="card text-center transition hover:shadow-elevated">
          <p className="text-2xl font-bold">{opportunities}</p>
          <p className="text-xs text-text-secondary">יש עניין ברכבים שלך</p>
        </Link>
        <Link
          href="/account"
          className="card col-span-2 text-center transition hover:shadow-elevated md:col-span-1"
        >
          <p className="text-lg font-bold text-text-primary">{connectionsLabel}</p>
          <p className="text-xs text-text-secondary">{connectionsSecondary}</p>
        </Link>
      </section>
      <ActiveSearchesSheet open={searchesOpen} onClose={() => setSearchesOpen(false)} />
    </>
  );
}

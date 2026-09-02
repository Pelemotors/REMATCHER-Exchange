"use client";

import { useEffect, useState } from "react";
import { PageHeaderV2, Surface } from "@/components/ui/brand-v2";

export function AdminProductIntelligence() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetch(`/api/admin/intelligence?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, [days]);

  if (!data) {
    return <p className="text-sm text-v2-text-secondary">טוען מדדי מוצר...</p>;
  }

  const lifecycle = data.lifecycle as Record<string, Record<string, unknown>>;
  const engagement = data.engagement as Record<string, number>;
  const communications = data.communications as { totals: Record<string, number>; receivedPct: number | null; clickedPct: number | null };

  return (
    <div className="space-y-6">
      <PageHeaderV2
        eyebrow="Admin"
        title="Product Intelligence"
        subtitle="מדדי Exchange, זמני מחזור, תגובות סוחרים ותקשורת"
      />

      <div className="flex gap-2">
        {[1, 7, 30].map((d) => (
          <button
            key={d}
            type="button"
            className={`rounded-lg px-3 py-1 text-sm ${days === d ? "bg-v2-signal text-white" : "bg-v2-surface-secondary"}`}
            onClick={() => setDays(d)}
          >
            {d === 1 ? "היום" : `${d} ימים`}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Surface depth="raised" className="p-4">
          <p className="text-xs text-v2-text-muted">DAU / WAU / MAU</p>
          <p className="text-lg font-semibold">
            {engagement.dau} / {engagement.wau} / {engagement.mau}
          </p>
          <p className="text-sm text-v2-text-secondary">
            סוחרים פעילים (30d): {engagement.activeDealers30d}
          </p>
        </Surface>
        <Surface depth="raised" className="p-4">
          <p className="text-xs text-v2-text-muted">Push — נשלח / התקבל / לחיצות</p>
          <p className="text-lg font-semibold">
            {communications.totals.sent} / {communications.totals.received || "—"} / {communications.totals.clicked || "—"}
          </p>
          {communications.receivedPct != null && (
            <p className="text-sm text-v2-text-secondary">CTR: {communications.clickedPct ?? "—"}%</p>
          )}
        </Surface>
        <Surface depth="raised" className="p-4">
          <p className="text-xs text-v2-text-muted">Deals ({days}d)</p>
          <p className="text-lg font-semibold">{(lifecycle.deal as { completed: number }).completed}</p>
        </Surface>
      </div>

      <Surface depth="raised" className="p-4">
        <h3 className="mb-2 font-semibold">Funnel</h3>
        <pre className="overflow-x-auto text-xs">{JSON.stringify(lifecycle.funnel, null, 2)}</pre>
      </Surface>

      <Surface depth="raised" className="p-4">
        <h3 className="mb-2 font-semibold">זמני מחזור (median)</h3>
        <ul className="space-y-1 text-sm">
          <li>Demand → Match: {(lifecycle.demand?.timeToFirstMatch as { median?: string })?.median ?? "N/A"}</li>
          <li>Match → Action: {(lifecycle.match?.timeToFirstAction as { median?: string })?.median ?? "N/A"}</li>
          <li>Mutual → Reveal: {(lifecycle.reveal?.timeFromMutual as { median?: string })?.median ?? "N/A"}</li>
          <li>Reveal → Outcome: {(lifecycle.reveal?.timeToOutcome as { median?: string })?.median ?? "N/A"}</li>
        </ul>
      </Surface>
    </div>
  );
}

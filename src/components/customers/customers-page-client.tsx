"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";
import {
  ButtonV2,
  PageHeaderV2,
  Surface,
  StatusBadge,
} from "@/components/ui/brand-v2";
import {
  demandNetworkLabelHe,
  demandStatusLabelHe,
} from "@/lib/vehicle-labels-he";

type DemandRow = {
  id: string;
  status: string;
  rawText: string;
  networkVisibility?: string;
  updatedAt: string;
  confirmedJson?: Record<string, unknown> | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  rawPhone: string | null;
  normalizedPhone: string | null;
  updatedAt: string;
  demands: DemandRow[];
};

function demandTitle(d: DemandRow): string {
  const c = d.confirmedJson;
  if (c && typeof c === "object") {
    const make = typeof c.make === "string" ? c.make : "";
    const model = typeof c.model === "string" ? c.model : "";
    const t = [make, model].filter(Boolean).join(" ");
    if (t) return t;
  }
  const raw = d.rawText?.trim();
  if (!raw) return "חיפוש";
  return raw.length > 48 ? `${raw.slice(0, 48)}…` : raw;
}

export function CustomersPageClient() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (query?.trim()) qs.set("q", query.trim());
      const res = await fetch(`/api/customers?${qs.toString()}`);
      if (!res.ok) {
        setError("לא ניתן לטעון לקוחות");
        return;
      }
      const data = await res.json();
      setRows((data.customers ?? []) as CustomerRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(q), 280);
    return () => window.clearTimeout(t);
  }, [q, load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/customers?id=${encodeURIComponent(selectedId)}`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (!cancelled) setDetail(data as CustomerRow);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function lifecycle(demandId: string, action: "pause" | "resume" | "close") {
    setBusy(true);
    try {
      const res = await fetch("/api/demands/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandId, action }),
      });
      if (!res.ok) {
        setError("הפעולה נכשלה");
        return;
      }
      if (selectedId) {
        const r = await fetch(`/api/customers?id=${encodeURIComponent(selectedId)}`);
        if (r.ok) setDetail(await r.json());
      }
      await load(q);
    } finally {
      setBusy(false);
    }
  }

  if (selectedId && detail) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-1 pb-8">
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-v2-text-muted"
          onClick={() => setSelectedId(null)}
        >
          <ChevronLeft size={16} className="rotate-180" aria-hidden />
          חזרה ללקוחות
        </button>
        <PageHeaderV2 title={detail.name ?? "לקוח"} />
        {detail.rawPhone ? (
          <p className="text-sm text-v2-text-secondary" dir="ltr">
            {detail.rawPhone}
          </p>
        ) : (
          <p className="text-sm text-v2-text-muted">אין טלפון שמור</p>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-v2-text-secondary">
            חיפושים
          </h3>
          {(detail.demands ?? []).length === 0 && (
            <Surface depth="raised" className="p-4 text-sm text-v2-text-muted">
              אין חיפושים מקושרים עדיין.
            </Surface>
          )}
          {(detail.demands ?? []).map((d) => (
            <Surface key={d.id} depth="raised" className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-v2-warm-white">
                    {demandTitle(d)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <StatusBadge
                      tone={d.status === "ACTIVE" ? "success" : "private"}
                      label={demandStatusLabelHe(d.status)}
                    />
                    <StatusBadge
                      tone={
                        d.networkVisibility === "ANONYMOUS_NETWORK"
                          ? "network"
                          : "private"
                      }
                      label={demandNetworkLabelHe(
                        d.networkVisibility ?? "PRIVATE"
                      )}
                    />
                  </div>
                </div>
                <Link
                  href={`/matches?demand=${d.id}`}
                  className="text-xs font-medium text-v2-signal"
                >
                  התאמות
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {d.status === "ACTIVE" && (
                  <ButtonV2
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void lifecycle(d.id, "pause")}
                  >
                    השהה
                  </ButtonV2>
                )}
                {d.status === "PAUSED" && (
                  <ButtonV2
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void lifecycle(d.id, "resume")}
                  >
                    המשך
                  </ButtonV2>
                )}
                {(d.status === "ACTIVE" || d.status === "PAUSED") && (
                  <ButtonV2
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void lifecycle(d.id, "close")}
                  >
                    סגור חיפוש
                  </ButtonV2>
                )}
              </div>
            </Surface>
          ))}
        </section>

        <ButtonV2 variant="primary" href="/home" className="w-full">
          חיפוש חדש ללקוח
        </ButtonV2>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-1 pb-8">
      <PageHeaderV2
        title="לקוחות"
        subtitle="לא CRM — רק מי שמחפש אצלך עכשיו"
      />
      <label className="relative block">
        <Search
          size={16}
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-v2-text-muted"
          aria-hidden
        />
        <input
          className="input w-full ps-9"
          placeholder="חיפוש לפי שם או טלפון"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="חיפוש לקוחות"
        />
      </label>

      {loading && (
        <p className="text-sm text-v2-text-muted" role="status">
          טוען…
        </p>
      )}
      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
      {!loading && rows.length === 0 && (
        <Surface depth="raised" className="p-4 text-sm text-v2-text-muted">
          עדיין אין לקוחות שמורים. שתף שיחת WhatsApp מהבית — נזהה לקוח בלי להקליד
          מחדש.
        </Surface>
      )}

      <ul className="space-y-0">
        {rows.map((c) => {
          const active = (c.demands ?? []).filter((d) => d.status === "ACTIVE");
          const summary =
            active[0] != null
              ? demandTitle(active[0])
              : c.demands[0]
                ? demandTitle(c.demands[0])
                : "אין חיפוש פעיל";
          return (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 border-b border-v2-border px-1 py-3.5 text-start"
                onClick={() => setSelectedId(c.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-v2-warm-white">
                    {c.name ?? "לקוח ללא שם"}
                  </span>
                  <span className="mt-0.5 block text-sm text-v2-text-secondary">
                    {summary}
                    {active.length > 1 ? ` · +${active.length - 1}` : ""}
                  </span>
                  {c.rawPhone ? (
                    <span
                      className="mt-0.5 block text-xs text-v2-text-muted"
                      dir="ltr"
                    >
                      {c.rawPhone}
                    </span>
                  ) : null}
                </span>
                <ChevronLeft
                  size={18}
                  className="shrink-0 text-v2-text-muted"
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

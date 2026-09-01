"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DemandCard } from "./demand-card";
import { LoadingSpinner } from "@/components/ui/common";
import type { EnrichedDemand } from "@/services/demand/demand-queries";

interface Props {
  compact?: boolean;
  lightweight?: boolean;
  limit?: number;
  onViewAll?: () => void;
}

export function MySearchesPanel({ compact, lightweight, limit, onViewAll }: Props) {
  const [active, setActive] = useState<EnrichedDemand[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const query = lightweight ? "?lightweight=true" : "";
    const res = await fetch(`/api/demands${query}`);
    const data = await res.json();
    setActive(data.active ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRenew(id: string) {
    await fetch("/api/demands/lifecycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demandId: id, action: "renew" }),
    });
    load();
  }

  async function handleClose(id: string) {
    if (!confirm("לסיים את החיפוש?")) return;
    await fetch("/api/demands/lifecycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demandId: id, action: "close" }),
    });
    load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  const shown = limit ? active.slice(0, limit) : active;

  if (shown.length === 0) {
    return (
      <div className="card text-center text-sm text-text-secondary">
        <p>אין חיפושים פעילים כרגע.</p>
        <Link href="/demand?new=1" className="btn-primary mt-4 inline-block">
          פתח חיפוש חדש
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {shown.map((d) => (
        <DemandCard
          key={d.id}
          demand={d}
          compact={compact}
          onRenew={handleRenew}
          onClose={handleClose}
          onEdit={() => {
            window.location.href = `/demand?edit=${d.id}`;
          }}
        />
      ))}
      {limit && active.length > limit && onViewAll && (
        <button type="button" className="btn-secondary w-full" onClick={onViewAll}>
          הצג את כל החיפושים ({active.length})
        </button>
      )}
    </div>
  );
}

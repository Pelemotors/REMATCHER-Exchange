"use client";

import { useEffect, useState } from "react";
import { ButtonV2, SkeletonBlockV2, Surface } from "@/components/ui/brand-v2";
import { DemandCard } from "./demand-card";
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
    return <SkeletonBlockV2 lines={3} className="py-8" />;
  }

  const shown = limit ? active.slice(0, limit) : active;

  if (shown.length === 0) {
    return (
      <Surface depth="raised" className="p-6 text-center text-sm text-v2-text-secondary">
        <p>אין חיפושים פעילים כרגע.</p>
        <ButtonV2 variant="signal" href="/demand?new=1" className="mt-4">
          פתח חיפוש חדש
        </ButtonV2>
      </Surface>
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
        <ButtonV2 variant="secondary" className="w-full" onClick={onViewAll}>
          הצג את כל החיפושים ({active.length})
        </ButtonV2>
      )}
    </div>
  );
}

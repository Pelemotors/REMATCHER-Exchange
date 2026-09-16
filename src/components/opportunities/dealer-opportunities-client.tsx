"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ButtonV2,
  EmptyStateV2,
  PageHeaderV2,
  StatusBadge,
  Surface,
} from "@/components/ui/brand-v2";

type DealerOpp = {
  id: string;
  type: string;
  title: string;
  priority: number;
  status: string;
  score: number | null;
  vehicleId: string | null;
  demandId: string | null;
  customerId: string | null;
  createdAt: string;
};

function typeLabel(type: string): string {
  switch (type) {
    case "NETWORK_SUPPLY_FOR_MY_DEMAND":
      return "היצע לחיפוש שלך";
    case "NETWORK_DEMAND_FOR_MY_VEHICLE":
      return "חיפוש לרכב שלך";
    case "PRIVATE_VEHICLE_FOR_MY_CUSTOMER":
      return "התאמה פרטית ללקוח";
    case "INTEREST_WAITING":
      return "עניין ממתין";
    case "MUTUAL_INTEREST":
      return "עניין הדדי";
    case "PRICE_OPENED_MATCH":
      return "מחיר פתח התאמה";
    case "DEMAND_FLEXIBILITY_OPENED_MATCH":
      return "גמישות פתחה התאמה";
    case "UNMET_DEMAND":
      return "פער ברשת";
    default:
      return "הזדמנות";
  }
}

function hrefFor(o: DealerOpp): string {
  if (o.type === "MUTUAL_INTEREST" || o.type === "INTEREST_WAITING") {
    return "/matches?tab=waiting";
  }
  if (o.demandId) return `/demand?id=${encodeURIComponent(o.demandId)}`;
  if (o.vehicleId) return `/inventory?focus=${encodeURIComponent(o.vehicleId)}`;
  if (o.customerId) return `/customers`;
  return "/matches";
}

export function DealerOpportunitiesClient() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const [rows, setRows] = useState<DealerOpp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [staleFocus, setStaleFocus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dealer-opportunities");
      if (!res.ok) {
        setError("לא ניתן לטעון הזדמנויות");
        return;
      }
      const data = await res.json();
      const list = (data.opportunities ?? []) as DealerOpp[];
      setRows(list);
      if (focusId) {
        const found = list.find((o) => o.id === focusId);
        setStaleFocus(!found);
        if (found) {
          window.setTimeout(() => {
            document
              .getElementById(`opp-${focusId}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 80);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [focusId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function dismiss(id: string) {
    setBusyId(id);
    try {
      await fetch("/api/dealer-opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", id }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-1 pb-10">
      <PageHeaderV2
        title="הזדמנויות"
        subtitle="מה כדאי לראות עכשיו — לא דשבורד מונים"
      />
      <ButtonV2
        variant="secondary"
        className="w-full"
        onClick={() => void load()}
        disabled={loading}
      >
        רענון
      </ButtonV2>

      {staleFocus && (
        <p className="text-sm text-v2-text-muted">
          ההזדמנות שחיפשת כבר לא פתוחה.
        </p>
      )}

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
        <EmptyStateV2
          title="אין הזדמנויות פתוחות"
          description="כשיופיע היצע/ביקוש רלוונטי או עניין ממתין — תופיע כאן."
          action={
            <ButtonV2 variant="primary" href="/home">
              חזרה לבית
            </ButtonV2>
          }
        />
      )}

      {rows.map((o) => (
        <div key={o.id} id={`opp-${o.id}`}>
          <Surface depth="raised" className="space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge tone="opportunity" label={typeLabel(o.type)} />
              {o.priority >= 90 ? (
                <StatusBadge tone="success" label="עדיפות גבוהה" />
              ) : null}
            </div>
            <p className="text-base font-semibold text-v2-warm-white">
              {o.title}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={hrefFor(o)} className="v2-btn-primary text-sm">
                פתח
              </Link>
              <ButtonV2
                variant="ghost"
                className="text-sm"
                disabled={busyId === o.id}
                onClick={() => void dismiss(o.id)}
              >
                התעלם
              </ButtonV2>
            </div>
          </Surface>
        </div>
      ))}
    </div>
  );
}

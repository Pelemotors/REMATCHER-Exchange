"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BadgeV2,
  ButtonV2,
  EmptyStateV2,
  PageHeaderV2,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";
import { InventoryImportPanel } from "@/components/inventory/inventory-import";
import {
  AttentionList,
  FilterPills,
  SnapshotBar,
  WorkspaceSection,
} from "@/components/ux/snapshot-attention";
import {
  commercialStateLabel,
  EMPTY_COPY,
  relativeDaysAgo,
  vehiclePrimaryState,
} from "@/lib/commercial-ux";
import { formatCurrency, formatNumber } from "@/lib/utils";
import styles from "./inventory.module.css";

interface Vehicle {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  b2bPrice: number | null;
  retailPrice: number | null;
  status: string;
  freshnessState: string;
  updatedAt: string;
  openInterestCount: number;
  pendingValidationCount: number;
}

type FilterId = "all" | "attention" | "interest" | "available" | "sold";

function openAgentInventory() {
  window.dispatchEvent(
    new CustomEvent("rematcher:open-assistant", {
      detail: { mode: "create_inventory" },
    })
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<SkeletonBlockV2 lines={4} className="py-8" />}>
      <InventoryPageContent />
    </Suspense>
  );
}

function InventoryPageContent() {
  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get("filter") as FilterId) || "all";
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [snapshot, setSnapshot] = useState({
    total: 0,
    needsAttention: 0,
    withInterest: 0,
    pendingValidation: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<FilterId>(
    initialFilter === "attention" ? "attention" : "all"
  );
  const [query, setQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/inventory");
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.vehicles ?? [];
    setVehicles(list);
    if (data.snapshot) setSnapshot(data.snapshot);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (searchParams.get("filter") === "attention") setFilter("attention");
  }, [searchParams]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawInput }),
    });
    const created = await res.json();
    setRawInput("");
    setShowAdd(false);
    setSubmitting(false);
    await load();
    if (created?.id) {
      setHighlightId(created.id);
      setTimeout(() => setHighlightId(null), 4000);
    }
  }

  async function markSold(id: string) {
    await fetch("/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: id, status: "SOLD" }),
    });
    await load();
  }

  const attentionItems = useMemo(() => {
    return vehicles
      .filter(
        (v) =>
          v.status === "ACTIVE" &&
          (v.freshnessState === "STALE" ||
            v.freshnessState === "VALIDATION_REQUIRED" ||
            v.pendingValidationCount > 0 ||
            (v.b2bPrice == null && v.retailPrice == null))
      )
      .map((v) => {
        const name = [v.make, v.model, v.year].filter(Boolean).join(" ") || "רכב";
        let body = relativeDaysAgo(v.updatedAt) ?? "";
        let badge = commercialStateLabel("needs_validation");
        if (v.pendingValidationCount > 0 || v.freshnessState !== "FRESH") {
          body = "צריך לאמת זמינות";
          badge = "דורש אימות";
        } else if (v.b2bPrice == null) {
          body = "חסר מחיר B2B";
          badge = "מידע חסר";
        }
        return {
          id: v.id,
          title: name,
          body,
          href:
            v.pendingValidationCount > 0 || v.freshnessState !== "FRESH"
              ? "/validations"
              : `/inventory?focus=${v.id}`,
          badge,
          urgent: true,
        };
      });
  }, [vehicles]);

  const filtered = useMemo(() => {
    let list = [...vehicles];
    if (filter === "attention") {
      list = list.filter((v) =>
        attentionItems.some((a) => a.id === v.id)
      );
    } else if (filter === "interest") {
      list = list.filter((v) => v.openInterestCount > 0);
    } else if (filter === "available") {
      list = list.filter(
        (v) => v.status === "ACTIVE" && v.freshnessState === "FRESH"
      );
    } else if (filter === "sold") {
      list = list.filter((v) => v.status === "SOLD");
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((v) =>
        [v.make, v.model, String(v.year ?? "")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    list.sort((a, b) => {
      const score = (v: Vehicle) => {
        if (v.pendingValidationCount > 0 || v.freshnessState !== "FRESH")
          return 0;
        if (v.openInterestCount > 0) return 1;
        if (v.b2bPrice == null) return 2;
        return 3;
      };
      const d = score(a) - score(b);
      if (d !== 0) return d;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return list;
  }, [vehicles, filter, query, attentionItems]);

  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeaderV2 title="המלאי שלי" subtitle="מרכז המלאי שלך ברשת" />
        <SkeletonBlockV2 lines={4} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeaderV2
        title="המלאי שלי"
        subtitle="מרכז המלאי שלך ברשת"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonV2 variant="signal" onClick={openAgentInventory}>
              הוסף עם הסוכן
            </ButtonV2>
            <ButtonV2 variant="secondary" onClick={() => setShowAdd(true)}>
              הוסף ידנית
            </ButtonV2>
            <ButtonV2
              variant="secondary"
              onClick={() => setShowImport(!showImport)}
            >
              ייבוא קובץ
            </ButtonV2>
          </div>
        }
      />

      <SnapshotBar
        metrics={[
          { label: "רכבים", value: snapshot.total },
          {
            label: "דורשים טיפול",
            value: snapshot.needsAttention,
            href: "/inventory?filter=attention",
            emphasize: snapshot.needsAttention > 0,
          },
          {
            label: "עם עניין",
            value: snapshot.withInterest,
            href: "/opportunities?source=inventory",
            emphasize: snapshot.withInterest > 0,
          },
          {
            label: "ממתינים לאימות",
            value: snapshot.pendingValidation,
            href: "/validations",
          },
        ]}
      />

      {attentionItems.length > 0 && filter === "all" && (
        <AttentionList title="דורש טיפול" items={attentionItems.slice(0, 5)} />
      )}

      {showImport && <InventoryImportPanel onComplete={load} />}

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6">
          <Surface depth="raised" className="space-y-4 p-4">
            <h3 className="font-semibold text-v2-text-primary">
              הוספת רכב (טקסט חופשי)
            </h3>
            <textarea
              className="input min-h-[100px]"
              placeholder='לדוגמה: Mazda CX-5 Premium 2023 61K km לבן B2B 134000'
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              required
            />
            <div className="flex flex-wrap gap-2">
              <ButtonV2 type="submit" variant="signal" disabled={submitting}>
                {submitting ? "שומר..." : "שמור"}
              </ButtonV2>
              <ButtonV2
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowAdd(false);
                  openAgentInventory();
                }}
              >
                הוסף עם הסוכן
              </ButtonV2>
              <ButtonV2 variant="secondary" onClick={() => setShowAdd(false)}>
                ביטול
              </ButtonV2>
            </div>
          </Surface>
        </form>
      )}

      <input
        className="input mb-3"
        placeholder="חיפוש: יצרן, דגם, שנה..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <FilterPills
        value={filter}
        onChange={(id) => setFilter(id as FilterId)}
        options={[
          { id: "all", label: "הכל" },
          { id: "attention", label: "דורש טיפול" },
          { id: "interest", label: "עם עניין" },
          { id: "available", label: "זמין" },
          { id: "sold", label: "נמכר" },
        ]}
      />

      <WorkspaceSection>
        {vehicles.length === 0 ? (
          <EmptyStateV2
            title={EMPTY_COPY.inventory.title}
            description={EMPTY_COPY.inventory.description}
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <ButtonV2 variant="signal" onClick={openAgentInventory}>
                  הוסף עם הסוכן
                </ButtonV2>
                <ButtonV2 variant="secondary" onClick={() => setShowAdd(true)}>
                  הוסף ידנית
                </ButtonV2>
              </div>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyStateV2
            title={EMPTY_COPY.inventoryFilter.title}
            description={EMPTY_COPY.inventoryFilter.description}
            action={
              <ButtonV2 variant="secondary" onClick={() => setFilter("all")}>
                נקה סינון
              </ButtonV2>
            }
          />
        ) : (
          <div className={styles.grid}>
            {filtered.map((v) => {
              const state = vehiclePrimaryState({
                status: v.status,
                freshnessState: v.freshnessState,
                hasInterest: v.openInterestCount > 0,
                missingB2b: v.b2bPrice == null,
              });
              const name =
                [v.make, v.model].filter(Boolean).join(" ") || "רכב";
              return (
                <Surface
                  key={v.id}
                  depth="raised"
                  className={`${styles.card} ${
                    highlightId === v.id ? "ring-2 ring-v2-signal" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-v2-text-primary">
                        {name} {v.year ?? ""}
                      </h3>
                      <p className="text-sm text-v2-text-secondary">
                        {formatNumber(v.mileage)} ק״מ
                        {v.b2bPrice != null
                          ? ` · ${formatCurrency(v.b2bPrice)} B2B`
                          : ""}
                      </p>
                    </div>
                    <BadgeV2
                      variant={
                        state.primary === "needs_validation" ||
                        state.primary === "has_interest"
                          ? "signal"
                          : state.primary === "missing_info"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {commercialStateLabel(state.primary)}
                    </BadgeV2>
                  </div>
                  <p className="mt-2 text-xs text-v2-text-muted">
                    {state.secondary ??
                      `עודכן ${relativeDaysAgo(v.updatedAt) ?? ""}`}
                  </p>
                  {(v.openInterestCount > 0 ||
                    v.pendingValidationCount > 0) && (
                    <p className="mt-2 text-sm text-v2-signal">
                      {v.openInterestCount > 0 &&
                        `${v.openInterestCount} עם עניין`}
                      {v.openInterestCount > 0 &&
                        v.pendingValidationCount > 0 &&
                        " · "}
                      {v.pendingValidationCount > 0 && "ממתין לאימות"}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(v.pendingValidationCount > 0 ||
                      v.freshnessState !== "FRESH") && (
                      <ButtonV2
                        variant="signal"
                        href="/validations"
                        className="text-sm"
                      >
                        אמת זמינות
                      </ButtonV2>
                    )}
                    {v.openInterestCount > 0 && (
                      <ButtonV2
                        variant="secondary"
                        href="/opportunities?source=inventory"
                        className="text-sm"
                      >
                        צפה בעניין
                      </ButtonV2>
                    )}
                    {v.status === "ACTIVE" && (
                      <ButtonV2
                        variant="ghost"
                        className="text-sm"
                        onClick={() => {
                          if (confirm("לסמן את הרכב כנמכר?")) markSold(v.id);
                        }}
                      >
                        סמן כנמכר
                      </ButtonV2>
                    )}
                  </div>
                </Surface>
              );
            })}
          </div>
        )}
      </WorkspaceSection>
    </div>
  );
}

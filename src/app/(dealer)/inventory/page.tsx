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
import { InventoryAgentWorkspace } from "@/components/inventory/inventory-agent-workspace";
import { useSetAgentPageContext } from "@/components/assistant/agent-workspace-provider";
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
  trim?: string | null;
  color?: string | null;
  status: string;
  freshnessState: string;
  updatedAt: string;
  openInterestCount: number;
  pendingValidationCount: number;
}

type FilterId = "all" | "attention" | "interest" | "active" | "sold" | "missing_price";

function vehicleName(v: Vehicle) {
  return [v.make, v.model, v.year].filter(Boolean).join(" ") || "רכב";
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
  const initialFilter = (searchParams.get("filter") as FilterId) || "active";
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [snapshot, setSnapshot] = useState({
    total: 0,
    sold: 0,
    all: 0,
    needsAttention: 0,
    withInterest: 0,
    pendingValidation: 0,
    missingPrivatePrice: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>(
    ["all", "attention", "interest", "active", "sold", "missing_price"].includes(
      initialFilter
    )
      ? initialFilter
      : "active"
  );
  const [query, setQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<"agent" | "import">("import");
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [soldConfirm, setSoldConfirm] = useState<Vehicle | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useSetAgentPageContext({ surface: "inventory", route: "/inventory" }, []);


  async function load(opts?: { page?: number; filter?: FilterId; q?: string }) {
    const page = opts?.page ?? pagination.page;
    const f = opts?.filter ?? filter;
    const q = opts?.q ?? query;
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(pagination.pageSize),
      filter: f,
    });
    if (q.trim()) qs.set("q", q.trim());
    const res = await fetch(`/api/inventory?${qs.toString()}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.vehicles ?? [];
    setVehicles((prev) => (page > 1 ? [...prev, ...list] : list));
    if (data.snapshot) setSnapshot((s) => ({ ...s, ...data.snapshot }));
    if (data.pagination) {
      setPagination((p) => ({
        ...p,
        page: data.pagination.page,
        totalCount: data.pagination.totalCount,
        hasMore: data.pagination.hasMore,
      }));
    }
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    void load({ page: 1, filter, q: query });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setLoading(true);
      void load({ page: 1, filter, q: query });
    }, 280);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    function onOpenWorkspace(e: Event) {
      const detail = (e as CustomEvent<{ tab?: "agent" | "import" }>).detail;
      const tab = detail?.tab ?? "agent";
      if (tab === "agent") {
        window.dispatchEvent(
          new CustomEvent("rematcher:open-assistant", {
            detail: {
              mode: "inventory_management",
              preferFocusOnMobile: true,
              presentation: "focus",
            },
          })
        );
        return;
      }
      setWorkspaceTab("import");
      setWorkspaceOpen(true);
    }
    window.addEventListener("rematcher:open-inventory-workspace", onOpenWorkspace);
    return () =>
      window.removeEventListener(
        "rematcher:open-inventory-workspace",
        onOpenWorkspace
      );
  }, []);

  useEffect(() => {
    if (searchParams.get("filter") === "attention") setFilter("attention");
    const focus = searchParams.get("focus");
    if (focus) {
      setHighlightId(focus);
      setFilter("all");
      if (searchParams.get("enrich") === "1") {
        // Prefer opening edit for private-price / enrichment deep links
        window.setTimeout(() => {
          const v = vehicles.find((x) => x.id === focus);
          if (v) {
            setEditVehicle(v);
            setEditForm({
              make: v.make ?? "",
              model: v.model ?? "",
              year: v.year != null ? String(v.year) : "",
              mileage: v.mileage != null ? String(v.mileage) : "",
              b2bPrice: v.b2bPrice != null ? String(v.b2bPrice) : "",
              retailPrice: v.retailPrice != null ? String(v.retailPrice) : "",
              color: v.color ?? "",
              trim: v.trim ?? "",
            });
          }
          document
            .getElementById(`vehicle-${focus}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 120);
      } else {
        window.setTimeout(() => {
          document
            .getElementById(`vehicle-${focus}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 120);
      }
    }
  }, [searchParams, vehicles]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  async function markSold(v: Vehicle) {
    setSoldConfirm(null);
    // optimistic remove from active
    setVehicles((prev) =>
      prev.map((x) =>
        x.id === v.id ? { ...x, status: "SOLD" } : x
      )
    );
    const res = await fetch("/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: v.id, status: "SOLD" }),
    });
    if (!res.ok) {
      await load();
      showToast("לא הצלחתי לעדכן. שום דבר לא השתנה.");
      return;
    }
    showToast("הרכב הוסר מהמלאי הפעיל");
    await load();
  }

  async function saveEdit() {
    if (!editVehicle) return;
    setSaving(true);
    const res = await fetch("/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: editVehicle.id,
        fields: {
          make: editForm.make || null,
          model: editForm.model || null,
          trim: editForm.trim || null,
          year: editForm.year ? parseInt(editForm.year, 10) : null,
          mileage: editForm.mileage ? parseInt(editForm.mileage, 10) : null,
          color: editForm.color || null,
          retailPrice: editForm.retailPrice
            ? parseInt(editForm.retailPrice.replace(/,/g, ""), 10)
            : null,
          b2bPrice: editForm.b2bPrice
            ? parseInt(editForm.b2bPrice.replace(/,/g, ""), 10)
            : null,
        },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      showToast("לא הצלחתי לשמור. שום דבר לא השתנה.");
      return;
    }
    setEditVehicle(null);
    showToast("עודכן");
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
        let body = "צריך בדיקה";
        let badge = "דורש אימות";
        if (v.pendingValidationCount > 0 || v.freshnessState !== "FRESH") {
          body = "צריך לאמת זמינות";
        } else if (v.b2bPrice == null) {
          body = "חסר מחיר B2B";
          badge = "מידע חסר";
        }
        return {
          id: v.id,
          title: vehicleName(v),
          body,
          href:
            v.pendingValidationCount > 0 || v.freshnessState !== "FRESH"
              ? "/validations"
              : `/inventory?focus=${v.id}&enrich=1&filter=active`,
          badge,
          urgent: true,
        };
      });
  }, [vehicles]);

  const filtered = useMemo(() => {
    // Server already filtered; keep light client search debounce for typing
    let list = [...vehicles];
    if (filter === "all") {
      // server returns ACTIVE+SOLD — keep all
    }
    return list;
  }, [vehicles, filter]);

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
            <ButtonV2
              variant="signal"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("rematcher:open-assistant", {
                    detail: {
                      mode: "inventory_management",
                      preferFocusOnMobile: true,
                      presentation: "focus",
                    },
                  })
                );
              }}
            >
              דבר עם ה-Agent
            </ButtonV2>
            <ButtonV2
              variant="secondary"
              onClick={() => {
                setWorkspaceTab("import");
                setWorkspaceOpen(true);
              }}
            >
              העלאת קובץ
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
        ]}
      />

      {toast && (
        <Surface depth="secondary" className="mb-3 border border-v2-signal/30 px-3 py-2 text-sm">
          {toast}
        </Surface>
      )}

      <InventoryAgentWorkspace
        open={workspaceOpen}
        initialTab={workspaceTab}
        onClose={() => setWorkspaceOpen(false)}
        onInventoryChanged={({ highlightId: id } = {}) => {
          void load().then(() => {
            if (id) {
              setHighlightId(id);
              setTimeout(() => setHighlightId(null), 4000);
            }
          });
        }}
      />

      {attentionItems.length > 0 && filter === "active" && !workspaceOpen && (
        <AttentionList title="דורש טיפול" items={attentionItems.slice(0, 5)} />
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
          { id: "active", label: "פעיל" },
          { id: "attention", label: "דורש טיפול" },
          { id: "interest", label: "עם עניין" },
          { id: "missing_price", label: "חסר מחיר" },
          { id: "sold", label: "נמכר" },
          { id: "all", label: "הכל" },
        ]}
      />

      <p className="mb-2 text-xs text-v2-text-muted">
        מציג {filtered.length} מתוך {pagination.totalCount || snapshot.total} ·
        פעילים במלאי: {snapshot.total}
      </p>
      {editVehicle && (
        <Surface depth="raised" className="mb-4 space-y-3 p-4">
          <h3 className="font-semibold text-v2-text-primary">
            עריכת {vehicleName(editVehicle)}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["make", "יצרן"],
                ["model", "דגם"],
                ["trim", "גימור"],
                ["year", "שנה"],
                ["mileage", "ק״מ"],
                ["color", "צבע"],
                ["retailPrice", "מחיר קמעונאי"],
                ["b2bPrice", "מחיר B2B"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input
                  className="input"
                  value={editForm[key] ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonV2 variant="signal" onClick={saveEdit} disabled={saving}>
              {saving ? "שומר..." : "שמור"}
            </ButtonV2>
            <ButtonV2
              variant="secondary"
              onClick={() => {
                setSoldConfirm(editVehicle);
              }}
            >
              סמן כנמכר
            </ButtonV2>
            <ButtonV2 variant="ghost" onClick={() => setEditVehicle(null)}>
              ביטול
            </ButtonV2>
          </div>
        </Surface>
      )}

      {soldConfirm && (
        <Surface depth="raised" className="mb-4 space-y-3 border border-v2-signal/30 p-4">
          <p className="text-sm text-v2-text-primary">
            לסמן את {vehicleName(soldConfirm)} כנמכרה?
            <br />
            היא תוסר מהמלאי הפעיל ולא תשתתף בהתאמות חדשות.
          </p>
          <div className="flex gap-2">
            <ButtonV2
              variant="signal"
              className="flex-1"
              onClick={() => markSold(soldConfirm)}
            >
              כן, נמכרה
            </ButtonV2>
            <ButtonV2
              variant="secondary"
              className="flex-1"
              onClick={() => setSoldConfirm(null)}
            >
              ביטול
            </ButtonV2>
          </div>
        </Surface>
      )}

      <WorkspaceSection>
        {vehicles.filter((v) => v.status === "ACTIVE").length === 0 &&
        filter !== "sold" ? (
          <EmptyStateV2
            title={EMPTY_COPY.inventory.title}
            description={EMPTY_COPY.inventory.description}
            action={
              <ButtonV2
                variant="signal"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("rematcher:open-assistant", {
                      detail: {
                        mode: "inventory_management",
                        preferFocusOnMobile: true,
                        presentation: "focus",
                      },
                    })
                  );
                }}
              >
                דבר עם ה-Agent
              </ButtonV2>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyStateV2
            title={EMPTY_COPY.inventoryFilter.title}
            description={EMPTY_COPY.inventoryFilter.description}
            action={
              <ButtonV2 variant="secondary" onClick={() => setFilter("active")}>
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
              return (
                <div key={v.id} id={`vehicle-${v.id}`}>
                <Surface
                  depth="raised"
                  className={`${styles.card} ${
                    highlightId === v.id ? "ring-2 ring-v2-signal" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-v2-text-primary">
                        {vehicleName(v)}
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
                  {v.openInterestCount > 0 && (
                    <p className="mt-2 text-sm text-v2-signal">
                      {v.openInterestCount} עם עניין
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(v.pendingValidationCount > 0 ||
                      v.freshnessState !== "FRESH") &&
                      v.status === "ACTIVE" && (
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
                        יש עניין
                      </ButtonV2>
                    )}
                    {v.status === "ACTIVE" && (
                      <>
                        <ButtonV2
                          variant="secondary"
                          className="text-sm"
                          onClick={() => {
                            setEditVehicle(v);
                            setEditForm({
                              make: v.make ?? "",
                              model: v.model ?? "",
                              trim: v.trim ?? "",
                              year: v.year != null ? String(v.year) : "",
                              mileage:
                                v.mileage != null ? String(v.mileage) : "",
                              color: v.color ?? "",
                              retailPrice:
                                v.retailPrice != null
                                  ? String(v.retailPrice)
                                  : "",
                              b2bPrice:
                                v.b2bPrice != null ? String(v.b2bPrice) : "",
                            });
                          }}
                        >
                          ערוך
                        </ButtonV2>
                        <ButtonV2
                          variant="ghost"
                          className="text-sm"
                          onClick={() => setSoldConfirm(v)}
                        >
                          סמן כנמכר
                        </ButtonV2>
                      </>
                    )}
                  </div>
                </Surface>
                </div>
              );
            })}
          </div>
        )}
        {pagination.hasMore && filtered.length > 0 && (
          <div className="mt-4 flex justify-center">
            <ButtonV2
              variant="secondary"
              onClick={() =>
                void load({ page: pagination.page + 1, filter, q: query })
              }
            >
              טען עוד
            </ButtonV2>
          </div>
        )}
      </WorkspaceSection>
    </div>
  );
}

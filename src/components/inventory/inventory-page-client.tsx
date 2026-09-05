"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import styles from "@/app/(dealer)/inventory/inventory.module.css";

export interface InventoryVehicle {
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

export type InventoryFilterId =
  | "all"
  | "attention"
  | "interest"
  | "active"
  | "sold"
  | "missing_price";

export interface InventoryInitialData {
  vehicles: InventoryVehicle[];
  snapshot: {
    total: number;
    sold: number;
    all: number;
    needsAttention: number;
    withInterest: number;
    pendingValidation: number;
    missingPrivatePrice: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    hasMore: boolean;
  };
}

function vehicleName(v: InventoryVehicle) {
  return [v.make, v.model, v.year].filter(Boolean).join(" ") || "רכב";
}

export function InventoryPageClient({
  initialData,
  initialFilter,
}: {
  initialData: InventoryInitialData;
  initialFilter: InventoryFilterId;
}) {
  const searchParams = useSearchParams();
  const [vehicles, setVehicles] = useState<InventoryVehicle[]>(initialData.vehicles);
  const [snapshot, setSnapshot] = useState(initialData.snapshot);
  const [pagination, setPagination] = useState(initialData.pagination);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<InventoryFilterId>(initialFilter);
  const [query, setQuery] = useState("");
  const firstFilterEffect = useRef(true);
  const firstQueryEffect = useRef(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<"agent" | "import">("import");
  const [editVehicle, setEditVehicle] = useState<InventoryVehicle | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [soldConfirm, setSoldConfirm] = useState<InventoryVehicle | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useSetAgentPageContext({ surface: "inventory", route: "/inventory" }, []);

  async function load(opts?: { page?: number; filter?: InventoryFilterId; q?: string }) {
    const page = opts?.page ?? pagination.page;
    const f = opts?.filter ?? filter;
    const q = opts?.q ?? query;
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(pagination.pageSize),
      filter: f,
    });
    if (q.trim()) qs.set("q", q.trim());

    try {
      const res = await fetch(`/api/inventory?${qs.toString()}`);
      if (!res.ok) throw new Error("inventory_load_failed");
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
    } catch {
      showToast("לא הצלחנו לטעון את המלאי. נסה שוב.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (firstFilterEffect.current) {
      firstFilterEffect.current = false;
      return;
    }
    setLoading(true);
    void load({ page: 1, filter, q: query });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (firstQueryEffect.current) {
      firstQueryEffect.current = false;
      return;
    }
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
    return () => window.removeEventListener("rematcher:open-inventory-workspace", onOpenWorkspace);
  }, []);

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus) return;
    setHighlightId(focus);
    window.setTimeout(() => {
      document.getElementById(`vehicle-${focus}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);
  }, [searchParams, vehicles]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }

  function beginEdit(v: InventoryVehicle) {
    setEditVehicle(v);
    setEditForm({
      make: v.make ?? "",
      model: v.model ?? "",
      trim: v.trim ?? "",
      year: v.year != null ? String(v.year) : "",
      mileage: v.mileage != null ? String(v.mileage) : "",
      color: v.color ?? "",
      retailPrice: v.retailPrice != null ? String(v.retailPrice) : "",
      b2bPrice: v.b2bPrice != null ? String(v.b2bPrice) : "",
    });
  }

  async function saveEdit() {
    if (!editVehicle || saving) return;
    setSaving(true);
    try {
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
      if (!res.ok) throw new Error("inventory_save_failed");
      setEditVehicle(null);
      showToast("עודכן");
      await load({ page: 1 });
    } catch {
      showToast("לא הצלחנו לשמור. שום דבר לא השתנה.");
    } finally {
      setSaving(false);
    }
  }

  async function markSold(v: InventoryVehicle) {
    if (saving) return;
    setSoldConfirm(null);
    setSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: v.id, status: "SOLD" }),
      });
      if (!res.ok) throw new Error("inventory_sold_failed");
      showToast("הרכב הוסר מהמלאי הפעיל");
      await load({ page: 1 });
    } catch {
      showToast("לא הצלחנו לעדכן. שום דבר לא השתנה.");
    } finally {
      setSaving(false);
    }
  }

  const attentionItems = useMemo(
    () =>
      vehicles
        .filter(
          (v) =>
            v.status === "ACTIVE" &&
            (v.freshnessState === "STALE" ||
              v.freshnessState === "VALIDATION_REQUIRED" ||
              v.pendingValidationCount > 0 ||
              (v.b2bPrice == null && v.retailPrice == null))
        )
        .map((v) => ({
          id: v.id,
          title: vehicleName(v),
          body:
            v.pendingValidationCount > 0 || v.freshnessState !== "FRESH"
              ? "צריך לאמת זמינות"
              : "חסר מחיר",
          href:
            v.pendingValidationCount > 0 || v.freshnessState !== "FRESH"
              ? `/validations?focus=${encodeURIComponent(v.id)}`
              : `/inventory?focus=${v.id}&enrich=1&filter=active`,
          badge:
            v.pendingValidationCount > 0 || v.freshnessState !== "FRESH"
              ? "דורש אימות"
              : "מידע חסר",
          urgent: true,
        })),
    [vehicles]
  );

  return (
    <div className={styles.page}>
      <PageHeaderV2
        title="המלאי שלי"
        subtitle="מרכז המלאי שלך ברשת"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonV2
              variant="signal"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("rematcher:open-assistant", {
                    detail: {
                      mode: "inventory_management",
                      preferFocusOnMobile: true,
                      presentation: "focus",
                    },
                  })
                )
              }
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
          void load({ page: 1 }).then(() => {
            if (id) {
              setHighlightId(id);
              window.setTimeout(() => setHighlightId(null), 4000);
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
        onChange={(id) => setFilter(id as InventoryFilterId)}
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
        מציג {vehicles.length} מתוך {pagination.totalCount || snapshot.total} · פעילים במלאי: {snapshot.total}
      </p>

      {loading && <SkeletonBlockV2 lines={3} className="mb-4" />}

      {editVehicle && (
        <Surface depth="raised" className="mb-4 space-y-3 p-4">
          <h3 className="font-semibold text-v2-text-primary">עריכת {vehicleName(editVehicle)}</h3>
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
                ["b2bPrice", "מחיר"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input
                  className="input"
                  value={editForm[key] ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonV2 variant="signal" onClick={saveEdit} disabled={saving}>
              {saving ? "שומר..." : "שמור"}
            </ButtonV2>
            <ButtonV2 variant="secondary" onClick={() => setSoldConfirm(editVehicle)} disabled={saving}>
              סמן כנמכר
            </ButtonV2>
            <ButtonV2 variant="ghost" onClick={() => setEditVehicle(null)} disabled={saving}>
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
            <ButtonV2 variant="signal" className="flex-1" onClick={() => markSold(soldConfirm)} disabled={saving}>
              {saving ? "מעדכן..." : "כן, נמכרה"}
            </ButtonV2>
            <ButtonV2 variant="secondary" className="flex-1" onClick={() => setSoldConfirm(null)} disabled={saving}>
              ביטול
            </ButtonV2>
          </div>
        </Surface>
      )}

      <WorkspaceSection>
        {!loading && vehicles.filter((v) => v.status === "ACTIVE").length === 0 && filter !== "sold" ? (
          <EmptyStateV2
            title={EMPTY_COPY.inventory.title}
            description={EMPTY_COPY.inventory.description}
            action={
              <ButtonV2
                variant="signal"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("rematcher:open-assistant", {
                      detail: {
                        mode: "inventory_management",
                        preferFocusOnMobile: true,
                        presentation: "focus",
                      },
                    })
                  )
                }
              >
                דבר עם ה-Agent
              </ButtonV2>
            }
          />
        ) : !loading && vehicles.length === 0 ? (
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
            {vehicles.map((v) => {
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
                    className={`${styles.card} ${highlightId === v.id ? "ring-2 ring-v2-signal" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-v2-text-primary">{vehicleName(v)}</h3>
                        <p className="text-sm text-v2-text-secondary">
                          {formatNumber(v.mileage)} ק״מ
                          {v.b2bPrice != null ? ` · ${formatCurrency(v.b2bPrice)}` : ""}
                        </p>
                      </div>
                      <BadgeV2
                        variant={
                          state.primary === "needs_validation" || state.primary === "has_interest"
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
                      {state.secondary ?? `עודכן ${relativeDaysAgo(v.updatedAt) ?? ""}`}
                    </p>
                    {v.openInterestCount > 0 && (
                      <p className="mt-2 text-sm text-v2-signal">{v.openInterestCount} עם עניין</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(v.pendingValidationCount > 0 || v.freshnessState !== "FRESH") && v.status === "ACTIVE" && (
                        <ButtonV2
                          variant="signal"
                          href={`/validations?focus=${encodeURIComponent(v.id)}`}
                          className="text-sm"
                        >
                          אמת זמינות
                        </ButtonV2>
                      )}
                      {v.openInterestCount > 0 && (
                        <ButtonV2 variant="secondary" href="/opportunities?source=inventory" className="text-sm">
                          יש עניין
                        </ButtonV2>
                      )}
                      {v.status === "ACTIVE" && (
                        <>
                          <ButtonV2 variant="secondary" className="text-sm" onClick={() => beginEdit(v)}>
                            ערוך
                          </ButtonV2>
                          <ButtonV2 variant="ghost" className="text-sm" onClick={() => setSoldConfirm(v)}>
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

        {pagination.hasMore && vehicles.length > 0 && (
          <div className="mt-4 flex justify-center">
            <ButtonV2
              variant="secondary"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                void load({ page: pagination.page + 1, filter, q: query });
              }}
            >
              {loading ? "טוען..." : "טען עוד"}
            </ButtonV2>
          </div>
        )}
      </WorkspaceSection>
    </div>
  );
}

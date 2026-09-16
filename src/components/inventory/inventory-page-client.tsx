"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  ButtonV2,
  SkeletonBlockV2,
  Surface,
  RelationshipBadge,
  VisibilityBadge,
} from "@/components/ui/brand-v2";
import { InventoryAgentWorkspace } from "@/components/inventory/inventory-agent-workspace";
import { VehicleMediaPanel } from "@/components/inventory/vehicle-media-panel";
import { useSetAgentPageContext } from "@/components/assistant/agent-workspace-provider";
import { EMPTY_COPY } from "@/lib/commercial-ux";
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
  mediaReady?: boolean;
  dealerRelationship?: string;
  visibility?: string;
  thumbUrl?: string | null;
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

function askingPrice(v: InventoryVehicle): number | null {
  return v.b2bPrice ?? v.retailPrice;
}

function humanVehicleState(v: InventoryVehicle): {
  label: string;
  tone: "signal" | "warning" | "muted";
} | null {
  const price = askingPrice(v);
  if (v.status === "SOLD" || v.status === "ARCHIVED") {
    return { label: "נמכר", tone: "muted" };
  }
  if (v.status !== "ACTIVE") return null;
  if (v.mediaReady === false) {
    return { label: "חסרות תמונות", tone: "warning" };
  }
  if (
    v.freshnessState === "STALE" ||
    v.freshnessState === "VALIDATION_REQUIRED" ||
    v.pendingValidationCount > 0
  ) {
    return { label: "דורש עדכון", tone: "warning" };
  }
  if (v.openInterestCount > 0) {
    return { label: "יש עניין", tone: "signal" };
  }
  if (price == null) {
    return { label: "חסר מחיר", tone: "warning" };
  }
  return null;
}

function vehicleMetaLine(v: InventoryVehicle): string {
  const parts: string[] = [];
  if (v.b2bPrice != null) parts.push(`סוחר ${formatCurrency(v.b2bPrice)}`);
  if (v.retailPrice != null) parts.push(`לקוח ${formatCurrency(v.retailPrice)}`);
  if (v.mileage != null) parts.push(`${formatNumber(v.mileage)} ק״מ`);
  return parts.join(" · ");
}

function openInventoryAssistant() {
  window.dispatchEvent(
    new CustomEvent("rematcher:open-assistant", {
      detail: {
        mode: "inventory_management",
        preferFocusOnMobile: true,
        presentation: "focus",
      },
    })
  );
}

const EMPTY_INVENTORY: InventoryInitialData = {
  vehicles: [],
  snapshot: {
    total: 0,
    sold: 0,
    all: 0,
    needsAttention: 0,
    withInterest: 0,
    pendingValidation: 0,
    missingPrivatePrice: 0,
  },
  pagination: {
    page: 1,
    pageSize: 20,
    totalCount: 0,
    hasMore: false,
  },
};

export function InventoryPageClient({
  initialData,
  initialFilter,
}: {
  initialData: InventoryInitialData | null;
  initialFilter: InventoryFilterId;
}) {
  const searchParams = useSearchParams();
  const seed = initialData ?? EMPTY_INVENTORY;
  const [vehicles, setVehicles] = useState<InventoryVehicle[]>(seed.vehicles);
  const [snapshot, setSnapshot] = useState(seed.snapshot);
  const [pagination, setPagination] = useState(seed.pagination);
  const [loading, setLoading] = useState(!initialData);
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
  const [archiveConfirm, setArchiveConfirm] = useState<InventoryVehicle | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [privateIntel, setPrivateIntel] = useState<{
    loading: boolean;
    text: string | null;
  }>({ loading: false, text: null });

  useSetAgentPageContext({ surface: "inventory", route: "/inventory" }, []);

  useEffect(() => {
    if (initialData) return;
    setLoading(true);
    void load({ page: 1, filter: initialFilter, q: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        openInventoryAssistant();
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

  async function askPrivateIntel(v: InventoryVehicle) {
    setPrivateIntel({ loading: true, text: null });
    try {
      const [privRes, netRes] = await Promise.all([
        fetch("/api/intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "private_match", vehicleId: v.id }),
        }),
        fetch("/api/intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "network_intel",
            make: v.make,
            model: v.model,
            yearMin: v.year,
            yearMax: v.year,
          }),
        }),
      ]);
      const priv = await privRes.json();
      const net = await netRes.json();
      const localCount = priv.ok ? priv.matchCount ?? 0 : 0;
      const netDemand =
        net.ok && !net.demand?.insufficientData ? net.demand.activeCount : null;
      const high =
        net.ok && !net.demand?.insufficientData
          ? net.demand.highMatchEstimate
          : null;
      const lines = [
        `אצלך: ${localCount} לקוחות רלוונטיים`,
        netDemand != null
          ? `ברשת: ${netDemand} חיפושים רלוונטיים${
              high != null ? ` · ${high} בהתאמה גבוהה` : ""
            }`
          : "ברשת: אין כרגע מספיק מידע אמין להצגה",
        "הרכב נשאר פרטי — בלי פרסום ובלי זהויות.",
      ];
      setPrivateIntel({ loading: false, text: lines.join("\n") });
    } catch {
      setPrivateIntel({
        loading: false,
        text: "לא הצלחנו לבדוק כרגע. נסה שוב.",
      });
    }
  }

  function beginEdit(v: InventoryVehicle) {
    setPrivateIntel({ loading: false, text: null });
    setEditVehicle(v);
    setEditForm({
      make: v.make ?? "",
      model: v.model ?? "",
      trim: v.trim ?? "",
      year: v.year != null ? String(v.year) : "",
      mileage: v.mileage != null ? String(v.mileage) : "",
      color: v.color ?? "",
      b2bPrice: v.b2bPrice != null ? String(v.b2bPrice) : "",
      retailPrice: v.retailPrice != null ? String(v.retailPrice) : "",
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
            b2bPrice: editForm.b2bPrice
              ? parseInt(editForm.b2bPrice.replace(/,/g, ""), 10)
              : null,
            retailPrice: editForm.retailPrice
              ? parseInt(editForm.retailPrice.replace(/,/g, ""), 10)
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

  async function archiveVehicle(v: InventoryVehicle) {
    if (saving) return;
    setArchiveConfirm(null);
    setSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: v.id, status: "ARCHIVED" }),
      });
      if (!res.ok) throw new Error("inventory_archive_failed");
      setEditVehicle(null);
      showToast("הרכב הוסר מהמלאי");
      await load({ page: 1 });
    } catch {
      showToast("לא הצלחנו להסיר. שום דבר לא השתנה.");
    } finally {
      setSaving(false);
    }
  }

  const segmentFilter =
    filter === "sold" ? "sold" : filter === "all" ? "all" : "active";

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>המלאי שלי</h1>
        <div className="flex flex-wrap gap-2">
          <ButtonV2 variant="ghost" href="/intake/review">
            סקירת קליטה
          </ButtonV2>
          <ButtonV2 variant="ghost" href="/intake/handoff">
            קליטה מהירה
          </ButtonV2>
          <ButtonV2 variant="signal" onClick={openInventoryAssistant}>
            + הוסף רכב
          </ButtonV2>
        </div>
      </div>

      <p className={styles.lede}>
        יש לך רכב? זרוק אותו לרשת — REMATCHER תחפש לו קונה.
        טעות בהעלאה? פתח את הרכב, מחק תמונות, או «הסר מהמלאי» בלי לסמן נמכר.
      </p>

      <button
        type="button"
        className={styles.importLink}
        onClick={() => {
          setWorkspaceTab("import");
          setWorkspaceOpen(true);
        }}
      >
        ייבוא
      </button>

      <input
        className="input"
        placeholder="חיפוש: יצרן, דגם, שנה..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className={styles.segment} role="tablist" aria-label="סינון מלאי">
        <button
          type="button"
          role="tab"
          aria-selected={segmentFilter === "active"}
          className={`${styles.segmentBtn} ${
            segmentFilter === "active" ? styles.segmentBtnActive : ""
          }`}
          onClick={() => setFilter("active")}
        >
          פעילים
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={segmentFilter === "sold"}
          className={`${styles.segmentBtn} ${
            segmentFilter === "sold" ? styles.segmentBtnActive : ""
          }`}
          onClick={() => setFilter("sold")}
        >
          נמכרו
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={segmentFilter === "all"}
          className={`${styles.segmentBtn} ${
            segmentFilter === "all" ? styles.segmentBtnActive : ""
          }`}
          onClick={() => setFilter("all")}
        >
          הכל
        </button>
      </div>

      {toast && (
        <Surface depth="secondary" className="border border-v2-signal/30 px-3 py-2 text-sm">
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

      {editVehicle && (
        <Surface depth="raised" className="space-y-3 p-4">
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
                ["b2bPrice", "מחיר לסוחר"],
                ["retailPrice", "מחיר ללקוח"],
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
            <ButtonV2 variant="primary" onClick={saveEdit} disabled={saving}>
              {saving ? "שומר..." : "שמור"}
            </ButtonV2>
            <ButtonV2
              variant="secondary"
              onClick={() => void askPrivateIntel(editVehicle)}
              disabled={saving || privateIntel.loading}
            >
              {privateIntel.loading ? "בודקים…" : "מה יש לי על הרכב הזה?"}
            </ButtonV2>
            <ButtonV2 variant="secondary" onClick={() => setSoldConfirm(editVehicle)} disabled={saving}>
              סמן כנמכר
            </ButtonV2>
            <ButtonV2 variant="ghost" onClick={() => setArchiveConfirm(editVehicle)} disabled={saving}>
              הסר מהמלאי
            </ButtonV2>
            <ButtonV2 variant="ghost" onClick={() => setEditVehicle(null)} disabled={saving}>
              ביטול
            </ButtonV2>
          </div>
          {privateIntel.text && (
            <Surface depth="secondary" className="whitespace-pre-line p-3 text-sm text-v2-text-primary">
              {privateIntel.text}
            </Surface>
          )}
          <VehicleMediaPanel vehicleId={editVehicle.id} />
        </Surface>
      )}

      {archiveConfirm && (
        <Surface depth="raised" className="space-y-3 border border-v2-border p-4">
          <p className="text-sm text-v2-text-primary">
            להסיר את {vehicleName(archiveConfirm)} מהמלאי?
            <br />
            לא מסמנים נמכר — רק מורידים מהמלאי הפעיל (למשל טעות בהעלאה).
          </p>
          <div className="flex gap-2">
            <ButtonV2 variant="signal" className="flex-1" onClick={() => archiveVehicle(archiveConfirm)} disabled={saving}>
              {saving ? "מסיר..." : "כן, הסר מהמלאי"}
            </ButtonV2>
            <ButtonV2 variant="secondary" className="flex-1" onClick={() => setArchiveConfirm(null)} disabled={saving}>
              ביטול
            </ButtonV2>
          </div>
        </Surface>
      )}

      {soldConfirm && (
        <Surface depth="raised" className="space-y-3 border border-v2-signal/30 p-4">
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

      {loading && vehicles.length === 0 && <SkeletonBlockV2 lines={3} />}

      {!loading &&
      vehicles.filter((v) => v.status === "ACTIVE").length === 0 &&
      filter !== "sold" ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{EMPTY_COPY.inventory.title}</p>
          <p className={styles.emptyBody}>{EMPTY_COPY.inventory.description}</p>
          <ButtonV2 variant="signal" className="mt-4" onClick={openInventoryAssistant}>
            + הוסף רכב
          </ButtonV2>
        </div>
      ) : !loading && vehicles.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{EMPTY_COPY.inventoryFilter.title}</p>
          <p className={styles.emptyBody}>{EMPTY_COPY.inventoryFilter.description}</p>
          <ButtonV2 variant="secondary" className="mt-4" onClick={() => setFilter("active")}>
            נקה סינון
          </ButtonV2>
        </div>
      ) : (
        <div className={styles.list}>
          {vehicles.map((v) => {
            const state = humanVehicleState(v);
            const meta = vehicleMetaLine(v);
            const rowClass = [
              styles.row,
              highlightId === v.id ? styles.rowHighlight : "",
              v.status !== "ACTIVE" ? styles.rowStatic : "",
            ]
              .filter(Boolean)
              .join(" ");
            const stateClass = [
              styles.rowState,
              state?.tone === "warning" ? styles.rowStateWarning : "",
              state?.tone === "muted" ? styles.rowStateMuted : "",
            ]
              .filter(Boolean)
              .join(" ");

            const content = (
              <>
                {v.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.thumbUrl}
                    alt=""
                    className={styles.thumbImg}
                    loading="lazy"
                    decoding="async"
                    width={56}
                    height={56}
                  />
                ) : (
                  <div className={styles.thumb} aria-hidden />
                )}
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>{vehicleName(v)}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {v.dealerRelationship ? (
                      <RelationshipBadge relationship={v.dealerRelationship} />
                    ) : null}
                    {v.visibility ? (
                      <VisibilityBadge visibility={v.visibility} />
                    ) : null}
                  </div>
                  {meta && <p className={styles.rowMeta}>{meta}</p>}
                  {state && <p className={stateClass}>{state.label}</p>}
                </div>
                {v.status === "ACTIVE" && (
                  <ChevronLeft className={styles.chevron} size={18} aria-hidden />
                )}
              </>
            );

            if (v.status === "ACTIVE") {
              return (
                <button
                  key={v.id}
                  id={`vehicle-${v.id}`}
                  type="button"
                  className={rowClass}
                  onClick={() => beginEdit(v)}
                >
                  {content}
                </button>
              );
            }

            return (
              <div key={v.id} id={`vehicle-${v.id}`} className={rowClass}>
                {content}
              </div>
            );
          })}
        </div>
      )}

      {pagination.hasMore && vehicles.length > 0 && (
        <div className={styles.loadMore}>
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
    </div>
  );
}

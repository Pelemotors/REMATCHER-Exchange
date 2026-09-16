"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeV2,
  ButtonV2,
  PageHeaderV2,
  Surface,
} from "@/components/ui/brand-v2";

type CatalogDto = {
  id: string;
  slug: string;
  displayName: string;
  status: "DRAFT" | "ENABLED" | "DISABLED";
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  description: string | null;
  logoUrl: string | null;
  publications: Array<{ vehicleId: string; publishedAt: string }>;
  _count?: { publications: number };
};

type InventoryVehicle = {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string;
  dealerRelationship?: string;
  visibility?: string;
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "טיוטה",
  ENABLED: "פעיל",
  DISABLED: "כבוי",
};

export function CatalogSettingsClient() {
  const [catalog, setCatalog] = useState<CatalogDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [slugInput, setSlugInput] = useState("");
  const [slugHint, setSlugHint] = useState<string | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    phone: "",
    whatsapp: "",
    address: "",
    description: "",
  });
  const [inventory, setInventory] = useState<InventoryVehicle[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyVehicle, setBusyVehicle] = useState<string | null>(null);

  const publishedIds = useMemo(
    () => new Set(catalog?.publications.map((p) => p.vehicleId) ?? []),
    [catalog]
  );

  const publicUrl = catalog
    ? `https://${catalog.slug}.rematcher.co.il`
    : null;

  const load = useCallback(async () => {
    setLoading(true);
    const [catRes, invRes] = await Promise.all([
      fetch("/api/catalog/me"),
      fetch("/api/inventory?filter=active&pageSize=100"),
    ]);
    const catJson = catRes.ok ? await catRes.json() : { catalog: null };
    const invJson = invRes.ok ? await invRes.json() : { vehicles: [] };
    const c = catJson.catalog as CatalogDto | null;
    setCatalog(c);
    if (c) {
      setSlugInput(c.slug);
      setForm({
        displayName: c.displayName ?? "",
        phone: c.phone ?? "",
        whatsapp: c.whatsapp ?? "",
        address: c.address ?? "",
        description: c.description ?? "",
      });
    }
    const vehicles = (invJson.vehicles ?? invJson.items ?? []) as InventoryVehicle[];
    setInventory(
      Array.isArray(vehicles)
        ? vehicles.filter((v) => v.status === "ACTIVE")
        : []
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!slugInput.trim() || (catalog && slugInput === catalog.slug)) {
      setSlugHint(null);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/catalog/slug-available?slug=${encodeURIComponent(slugInput)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.available) setSlugHint("הכתובת פנויה");
          else if (d.reason === "slug_reserved") setSlugHint("כתובת שמורה");
          else if (d.reason === "slug_taken") setSlugHint("כתובת תפוסה");
          else setSlugHint("כתובת לא תקינה");
        })
        .catch(() => setSlugHint(null));
    }, 350);
    return () => clearTimeout(t);
  }, [slugInput, catalog]);

  async function saveSettings() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/catalog/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: slugInput,
        displayName: form.displayName,
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
        address: form.address || null,
        description: form.description || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMsg(
        data.error === "slug_taken"
          ? "הכתובת תפוסה"
          : data.error === "slug_reserved"
            ? "כתובת שמורה למערכת"
            : "שגיאה בשמירה"
      );
      return;
    }
    setMsg(data.created ? "הקטלוג נוצר" : "נשמר");
    await load();
  }

  async function setStatus(action: "enable" | "disable" | "draft") {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/catalog/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setSaving(false);
    if (!res.ok) {
      setMsg("לא ניתן לעדכן סטטוס");
      return;
    }
    setMsg(
      action === "enable"
        ? "הקטלוג פעיל לציבור"
        : action === "disable"
          ? "הקטלוג כבוי"
          : "חזר לטיוטה"
    );
    await load();
  }

  async function togglePublish(vehicleId: string, publish: boolean) {
    setBusyVehicle(vehicleId);
    const res = await fetch(
      publish ? "/api/catalog/publish" : "/api/catalog/unpublish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId }),
      }
    );
    setBusyVehicle(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.message ?? "לא ניתן לעדכן פרסום");
      return;
    }
    await load();
  }

  async function bulkPublish() {
    const ids = [...selected];
    if (!ids.length) return;
    setSaving(true);
    const res = await fetch("/api/catalog/bulk-publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleIds: ids }),
    });
    const data = await res.json();
    setSaving(false);
    setMsg(
      res.ok
        ? `פורסמו ${data.published} רכבים${data.failed ? ` · ${data.failed} נכשלו` : ""}`
        : "שגיאה בפרסום מרובה"
    );
    setSelected(new Set());
    await load();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <p className="p-2 text-sm text-v2-text-muted" role="status">
        טוען קטלוג…
      </p>
    );
  }

  return (
    <div>
      <PageHeaderV2
        title="קטלוג דיגיטלי"
        subtitle="פרסום ציבורי נפרד מרשת ההתאמות — רק רכבים שתבחר"
      />

      <Surface depth="raised" className="mb-4 space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-v2-text-primary">הגדרות קטלוג</h3>
          {catalog && (
            <BadgeV2 variant={catalog.status === "ENABLED" ? "success" : "neutral"}>
              {STATUS_LABEL[catalog.status] ?? catalog.status}
            </BadgeV2>
          )}
        </div>

        <label className="label">כתובת (slug)</label>
        <div className="flex flex-wrap items-center gap-2" dir="ltr">
          <input
            className="input flex-1 min-w-[10rem]"
            value={slugInput}
            onChange={(e) => setSlugInput(e.target.value)}
            placeholder="your-dealer"
            autoComplete="off"
          />
          <span className="text-sm text-v2-text-muted">.rematcher.co.il</span>
        </div>
        {slugHint && (
          <p className="text-sm text-v2-text-secondary">{slugHint}</p>
        )}

        <label className="label">שם תצוגה</label>
        <input
          className="input"
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
        />

        <label className="label">טלפון</label>
        <input
          className="input"
          dir="ltr"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <label className="label">WhatsApp</label>
        <input
          className="input"
          dir="ltr"
          value={form.whatsapp}
          onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          placeholder="9725..."
        />

        <label className="label">כתובת</label>
        <input
          className="input"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />

        <label className="label">תיאור</label>
        <textarea
          className="input min-h-[88px]"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <div className="flex flex-wrap gap-2">
          <ButtonV2 variant="primary" disabled={saving} onClick={saveSettings}>
            {catalog ? "שמור הגדרות" : "צור קטלוג"}
          </ButtonV2>
          {catalog && catalog.status !== "ENABLED" && (
            <ButtonV2
              variant="secondary"
              disabled={saving}
              onClick={() => setStatus("enable")}
            >
              הפעל לציבור
            </ButtonV2>
          )}
          {catalog?.status === "ENABLED" && (
            <ButtonV2
              variant="ghost"
              disabled={saving}
              onClick={() => setStatus("disable")}
            >
              כבה קטלוג
            </ButtonV2>
          )}
        </div>

        {publicUrl && catalog?.status === "ENABLED" && (
          <p className="text-sm text-v2-text-secondary" dir="ltr">
            קישור ציבורי:{" "}
            <a
              className="text-v2-gold underline"
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {publicUrl}
            </a>
            {" · "}
            <Link className="underline" href={`/c/${catalog.slug}`}>
              תצוגה מקדימה
            </Link>
          </p>
        )}
        {msg && <p className="text-sm text-v2-text-secondary">{msg}</p>}
      </Surface>

      <Surface depth="raised" className="mb-4 space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-v2-text-primary">רכבים בקטלוג</h3>
          <div className="flex gap-2">
            <ButtonV2 variant="ghost" href="/inventory">
              למלאי
            </ButtonV2>
            <ButtonV2
              variant="secondary"
              disabled={saving || selected.size === 0 || !catalog}
              onClick={bulkPublish}
            >
              פרסם נבחרים ({selected.size})
            </ButtonV2>
          </div>
        </div>
        <p className="text-sm text-v2-text-muted">
          Offer / Trade-in / External לא ניתנים לפרסום. בעלות במלאי לא מפרסמת
          אוטומטית — יש לבחור במפורש.
        </p>

        {!catalog && (
          <p className="text-sm text-v2-text-secondary">
            צור קטלוג למעלה לפני פרסום רכבים.
          </p>
        )}

        <ul className="divide-y divide-v2-border">
          {inventory.map((v) => {
            const title =
              [v.make, v.model, v.year].filter(Boolean).join(" ") || v.id;
            const isPub = publishedIds.has(v.id);
            const blocked = ["OFFERED_TO_ME", "TRADE_IN_CANDIDATE", "EXTERNAL"].includes(
              v.dealerRelationship ?? "OWNED"
            );
            return (
              <li
                key={v.id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <input
                  type="checkbox"
                  checked={selected.has(v.id)}
                  disabled={blocked || !catalog || isPub}
                  onChange={() => toggleSelect(v.id)}
                  aria-label={`בחר ${title}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-v2-text-primary">{title}</p>
                  <p className="text-xs text-v2-text-muted">
                    {v.dealerRelationship ?? "OWNED"}
                    {isPub ? " · מפורסם בקטלוג" : ""}
                    {blocked ? " · לא ניתן לפרסם" : ""}
                  </p>
                </div>
                {!blocked && catalog && (
                  <ButtonV2
                    variant={isPub ? "ghost" : "secondary"}
                    disabled={busyVehicle === v.id}
                    onClick={() => togglePublish(v.id, !isPub)}
                  >
                    {busyVehicle === v.id
                      ? "…"
                      : isPub
                        ? "הסר מהקטלוג"
                        : "פרסם"}
                  </ButtonV2>
                )}
              </li>
            );
          })}
          {inventory.length === 0 && (
            <li className="py-4 text-sm text-v2-text-muted">
              אין רכבים פעילים.{" "}
              <Link href="/inventory" className="underline">
                הוסף מלאי
              </Link>
            </li>
          )}
        </ul>
      </Surface>
    </div>
  );
}

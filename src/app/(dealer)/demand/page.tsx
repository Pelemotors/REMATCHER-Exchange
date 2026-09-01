"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader, LoadingSpinner } from "@/components/ui/common";
import { MySearchesPanel } from "@/components/demand/my-searches-panel";
import { CreateDemandFlow } from "@/components/demand/create-demand-flow";
import type { EnrichedDemand } from "@/services/demand/demand-queries";

export default function DemandPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-text-muted">טוען...</div>}>
      <DemandPageContent />
    </Suspense>
  );
}

function DemandPageContent() {
  const searchParams = useSearchParams();
  const showNew = searchParams.get("new") === "1";
  const editId = searchParams.get("edit");
  const [mode, setMode] = useState<"list" | "create" | "edit">(
    showNew ? "create" : editId ? "edit" : "list"
  );
  const [tab, setTab] = useState<"active" | "ended">("active");
  const [active, setActive] = useState<EnrichedDemand[]>([]);
  const [ended, setEnded] = useState<EnrichedDemand[]>([]);
  const [editDemand, setEditDemand] = useState<EnrichedDemand | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/demands?history=true");
    const data = await res.json();
    setActive(data.active ?? []);
    setEnded(data.ended ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (editId && active.length + ended.length > 0) {
      const all = [...active, ...ended];
      const found = all.find((d) => d.id === editId);
      if (found) {
        setEditDemand(found);
        setEditForm({ ...found.confirmed });
        setMode("edit");
      }
    }
  }, [editId, active, ended]);

  async function saveEdit() {
    if (!editDemand) return;
    setSaving(true);
    await fetch(`/api/demands/${editDemand.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: editForm }),
    });
    setSaving(false);
    setMode("list");
    load();
  }

  if (mode === "create") {
    return (
      <div>
        <PageHeader
          title="חיפוש חדש"
          subtitle="תאר מה אתה מחפש — Exchange יעבוד ברקע"
          action={
            <button className="btn-secondary" onClick={() => setMode("list")}>
              חזרה
            </button>
          }
        />
        <CreateDemandFlow
          onCreated={load}
          onCancel={() => setMode("list")}
        />
      </div>
    );
  }

  if (mode === "edit" && editDemand) {
    return (
      <div>
        <PageHeader
          title="עריכת חיפוש"
          subtitle={editDemand.title}
          action={
            <button className="btn-secondary" onClick={() => setMode("list")}>
              ביטול
            </button>
          }
        />
        <div className="card space-y-4">
          <p className="text-sm text-text-secondary">{editDemand.reflection}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">יצרן</label>
              <input
                className="input"
                value={String(editForm.make ?? "")}
                onChange={(e) => setEditForm({ ...editForm, make: e.target.value })}
              />
            </div>
            <div>
              <label className="label">דגם</label>
              <input
                className="input"
                value={String(editForm.model ?? "")}
                onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
              />
            </div>
            <div>
              <label className="label">שנתון מינימום</label>
              <input
                className="input"
                type="number"
                value={String(editForm.yearMin ?? "")}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    yearMin: parseInt(e.target.value, 10) || null,
                  })
                }
              />
            </div>
            <div>
              <label className="label">תקציב מקסימום</label>
              <input
                className="input"
                type="number"
                value={String(editForm.budgetMax ?? "")}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    budgetMax: parseInt(e.target.value, 10) || null,
                  })
                }
              />
            </div>
          </div>
          <button
            className="btn-primary w-full"
            onClick={saveEdit}
            disabled={saving}
          >
            {saving ? "שומר..." : "שמור וחפש מחדש"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="החיפושים שלי"
        subtitle="מה REMATCHER Exchange מחפש עבורך ברקע"
        action={
          <button className="btn-primary" onClick={() => setMode("create")}>
            + חיפוש חדש
          </button>
        }
      />

      {active.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 rounded-lg border border-signal/20 bg-signal-soft/40 px-4 py-3">
            <p className="text-sm font-medium text-ink">סיכום החיפושים הפעילים</p>
            <p className="mt-1 text-sm text-text-secondary">
              {active.map((d) => d.reflection).join(" ")}
            </p>
          </div>
        </section>
      )}

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className={tab === "active" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("active")}
        >
          פעילים ({active.length})
        </button>
        <button
          type="button"
          className={tab === "ended" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("ended")}
        >
          הסתיימו ({ended.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : tab === "active" ? (
        active.length > 0 ? (
          <MySearchesPanel />
        ) : (
          <div className="card text-center text-sm text-text-secondary">
            <p>אין חיפושים פעילים.</p>
            <button className="btn-primary mt-4" onClick={() => setMode("create")}>
              פתח חיפוש ראשון
            </button>
          </div>
        )
      ) : ended.length > 0 ? (
        <div className="space-y-3">
          {ended.map((d) => (
            <div key={d.id} className="card">
              <h3 className="font-bold">{d.title}</h3>
              <p className="text-sm text-text-secondary">{d.subtitle}</p>
              <p className="mt-2 text-xs text-text-muted">
                הסתיים · עודכן {new Date(d.updatedAt).toLocaleDateString("he-IL")}
              </p>
              <button
                className="btn-secondary mt-3 text-sm"
                onClick={async () => {
                  await fetch("/api/demands/lifecycle", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ demandId: d.id, action: "renew" }),
                  });
                  load();
                  setTab("active");
                }}
              >
                הפעל מחדש
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted">אין חיפושים שהסתיימו.</p>
      )}

      <Link href="/home" className="btn-secondary mt-8 inline-block">
        חזרה לבית
      </Link>
    </div>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ButtonV2,
  PageHeaderV2,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";
import { MySearchesPanel } from "@/components/demand/my-searches-panel";
import { CreateDemandFlow } from "@/components/demand/create-demand-flow";
import type { EnrichedDemand } from "@/services/demand/demand-queries";

export default function DemandPage() {
  return (
    <Suspense fallback={<SkeletonBlockV2 lines={3} className="py-12" />}>
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
        <PageHeaderV2
          title="חיפוש חדש"
          subtitle="תאר מה אתה מחפש — Exchange יעבוד ברקע"
          action={
            <ButtonV2 variant="secondary" onClick={() => setMode("list")}>
              חזרה
            </ButtonV2>
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
        <PageHeaderV2
          title="עריכת חיפוש"
          subtitle={editDemand.title}
          action={
            <ButtonV2 variant="secondary" onClick={() => setMode("list")}>
              ביטול
            </ButtonV2>
          }
        />
        <Surface depth="raised" className="space-y-4 p-4">
          <p className="text-sm text-v2-text-secondary">{editDemand.reflection}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <ButtonV2
            variant="signal"
            className="w-full"
            onClick={saveEdit}
            disabled={saving}
          >
            {saving ? "שומר..." : "שמור וחפש מחדש"}
          </ButtonV2>
        </Surface>
      </div>
    );
  }

  return (
    <div>
      <PageHeaderV2
        title="החיפושים שלי"
        subtitle="מה REMATCHER Exchange מחפש עבורך ברקע"
        action={
          <ButtonV2 variant="signal" onClick={() => setMode("create")}>
            + חיפוש חדש
          </ButtonV2>
        }
      />

      {active.length > 0 && (
        <section className="mb-6">
          <Surface depth="secondary" className="border border-v2-signal/20 px-4 py-3">
            <p className="text-sm font-medium text-v2-text-primary">סיכום החיפושים הפעילים</p>
            <p className="mt-1 text-sm text-v2-text-secondary">
              {active.map((d) => d.reflection).join(" ")}
            </p>
          </Surface>
        </section>
      )}

      <div className="mb-4 flex gap-2">
        <ButtonV2
          variant={tab === "active" ? "signal" : "secondary"}
          onClick={() => setTab("active")}
        >
          פעילים ({active.length})
        </ButtonV2>
        <ButtonV2
          variant={tab === "ended" ? "signal" : "secondary"}
          onClick={() => setTab("ended")}
        >
          הסתיימו ({ended.length})
        </ButtonV2>
      </div>

      {loading ? (
        <SkeletonBlockV2 lines={4} className="py-12" />
      ) : tab === "active" ? (
        active.length > 0 ? (
          <MySearchesPanel />
        ) : (
          <Surface depth="raised" className="p-6 text-center text-sm text-v2-text-secondary">
            <p>אין חיפושים פעילים.</p>
            <ButtonV2 variant="signal" className="mt-4" onClick={() => setMode("create")}>
              פתח חיפוש ראשון
            </ButtonV2>
          </Surface>
        )
      ) : ended.length > 0 ? (
        <div className="space-y-3">
          {ended.map((d) => (
            <Surface key={d.id} depth="raised" className="p-4">
              <h3 className="font-bold text-v2-text-primary">{d.title}</h3>
              <p className="text-sm text-v2-text-secondary">{d.subtitle}</p>
              <p className="mt-2 text-xs text-v2-text-muted">
                הסתיים · עודכן {new Date(d.updatedAt).toLocaleDateString("he-IL")}
              </p>
              <ButtonV2
                variant="secondary"
                className="mt-3 text-sm"
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
              </ButtonV2>
            </Surface>
          ))}
        </div>
      ) : (
        <p className="text-sm text-v2-text-muted">אין חיפושים שהסתיימו.</p>
      )}

      <ButtonV2 variant="secondary" href="/home" className="mt-8">
        חזרה לבית
      </ButtonV2>
    </div>
  );
}

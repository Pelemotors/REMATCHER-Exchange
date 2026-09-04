"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ButtonV2,
  EmptyStateV2,
  PageHeaderV2,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";
import { DemandCard } from "@/components/demand/demand-card";
import { CreateDemandFlow } from "@/components/demand/create-demand-flow";
import { useSetAgentPageContext } from "@/components/assistant/agent-workspace-provider";
import {
  AttentionList,
  FilterPills,
  SnapshotBar,
  WorkspaceSection,
} from "@/components/ux/snapshot-attention";
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
  const filterParam = searchParams.get("filter");
  const [mode, setMode] = useState<"list" | "create" | "edit">(
    showNew ? "create" : editId ? "edit" : "list"
  );
  const [tab, setTab] = useState<"active" | "ended">("active");
  const [active, setActive] = useState<EnrichedDemand[]>([]);
  const [ended, setEnded] = useState<EnrichedDemand[]>([]);

  useSetAgentPageContext({ surface: "demand", route: "/demand" }, []);
  const [editDemand, setEditDemand] = useState<EnrichedDemand | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAttentionOnly, setShowAttentionOnly] = useState(
    filterParam === "attention"
  );

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
    if (filterParam === "attention") setShowAttentionOnly(true);
  }, [filterParam]);

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

  const snapshot = useMemo(() => {
    const withMatches = active.filter((d) => d.hasAuthorizedMatch).length;
    const expiring = active.filter((d) => d.uxStatus === "EXPIRING").length;
    return {
      active: active.length,
      withMatches,
      expiring,
    };
  }, [active]);

  const attentionItems = useMemo(() => {
    return active
      .filter(
        (d) => d.hasAuthorizedMatch || d.uxStatus === "EXPIRING"
      )
      .map((d) => ({
        id: d.id,
        title: d.title,
        body: d.hasAuthorizedMatch
          ? `${d.authorizedMatchCount} התאמות חדשות`
          : "מסתיים בקרוב",
        href: d.hasAuthorizedMatch
          ? "/matches?tab=action"
          : `/demand?edit=${d.id}`,
        badge: d.hasAuthorizedMatch ? "נמצאה התאמה" : "מסתיים בקרוב",
        urgent: true,
      }));
  }, [active]);

  const sortedActive = useMemo(() => {
    const list = showAttentionOnly
      ? active.filter(
          (d) => d.hasAuthorizedMatch || d.uxStatus === "EXPIRING"
        )
      : [...active];
    return list.sort((a, b) => {
      const score = (d: EnrichedDemand) => {
        if (d.hasAuthorizedMatch) return 0;
        if (d.uxStatus === "EXPIRING") return 1;
        return 2;
      };
      return score(a) - score(b);
    });
  }, [active, showAttentionOnly]);

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

  async function handleRenew(id: string) {
    await fetch("/api/demands/lifecycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demandId: id, action: "renew" }),
    });
    load();
    setTab("active");
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
        subtitle="מה REMATCHER מחפש עבורך ברקע"
        action={
          <ButtonV2 variant="signal" onClick={() => setMode("create")}>
            + חיפוש חדש
          </ButtonV2>
        }
      />

      <SnapshotBar
        metrics={[
          { label: "פעילים", value: snapshot.active },
          {
            label: "עם התאמות",
            value: snapshot.withMatches,
            href: "/matches?tab=action",
            emphasize: snapshot.withMatches > 0,
          },
          {
            label: "מסתיים בקרוב",
            value: snapshot.expiring,
            emphasize: snapshot.expiring > 0,
          },
        ]}
      />

      {attentionItems.length > 0 && tab === "active" && !showAttentionOnly && (
        <AttentionList title="דורשים תשומת לב" items={attentionItems} />
      )}

      <FilterPills
        value={tab}
        onChange={(id) => {
          setTab(id as "active" | "ended");
          setShowAttentionOnly(false);
        }}
        options={[
          { id: "active", label: `פעילים ברקע (${active.length})` },
          { id: "ended", label: `הסתיימו (${ended.length})` },
        ]}
      />

      {loading ? (
        <SkeletonBlockV2 lines={4} className="py-12" />
      ) : tab === "active" ? (
        <WorkspaceSection>
          {sortedActive.length > 0 ? (
            <div className="space-y-3">
              {sortedActive.map((d) => (
                <DemandCard
                  key={d.id}
                  demand={d}
                  onRenew={handleRenew}
                  onClose={handleClose}
                  onEdit={() => {
                    setEditDemand(d);
                    setEditForm({ ...d.confirmed });
                    setMode("edit");
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyStateV2
              title={
                showAttentionOnly
                  ? "אין חיפושים שדורשים תשומת לב כרגע"
                  : "אין חיפושים פעילים"
              }
              description={
                showAttentionOnly
                  ? "כל החיפושים הפעילים ממשיכים ברקע."
                  : "פתח חיפוש כדי ש-REMATCHER יבדוק את הרשת עבורך."
              }
              action={
                showAttentionOnly ? (
                  <ButtonV2
                    variant="secondary"
                    onClick={() => setShowAttentionOnly(false)}
                  >
                    הצג את כל החיפושים
                  </ButtonV2>
                ) : (
                  <ButtonV2 variant="signal" onClick={() => setMode("create")}>
                    פתח חיפוש ראשון
                  </ButtonV2>
                )
              }
            />
          )}
        </WorkspaceSection>
      ) : (
        <WorkspaceSection>
          {ended.length > 0 ? (
            <div className="space-y-3">
              {ended.map((d) => (
                <DemandCard
                  key={d.id}
                  demand={d}
                  onRenew={handleRenew}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-v2-text-muted">אין חיפושים שהסתיימו.</p>
          )}
        </WorkspaceSection>
      )}
    </div>
  );
}

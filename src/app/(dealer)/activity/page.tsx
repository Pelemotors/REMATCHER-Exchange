"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeV2,
  ButtonV2,
  EmptyStateV2,
  PageHeaderV2,
  SectionHeader,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";
import { EMPTY_COPY } from "@/lib/commercial-ux";
import { formatRelative, cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  sourceCategory?: string | null;
}

const ACTION_TYPES = new Set([
  "VALIDATION_REQUEST",
  "MATCH_READY",
  "BUYER_INTEREST",
  "SELLER_OPPORTUNITY",
  "MUTUAL_INTEREST",
  "OUTCOME_REMINDER",
  "REVEAL_CREATED",
]);

function isActionItem(n: Notification): boolean {
  if (n.sourceCategory === "ADMIN") return false;
  if (ACTION_TYPES.has(n.type)) return true;
  if (n.link?.includes("/validations")) return true;
  if (n.link?.includes("/reveals/")) return true;
  if (n.link?.includes("/matches")) return true;
  if (n.link?.includes("/opportunities")) return true;
  return false;
}

function dayBucket(iso: string): "today" | "yesterday" | "earlier" {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  if (d >= startToday) return "today";
  if (d >= startYesterday) return "yesterday";
  return "earlier";
}

function isAdminItem(n: Notification): boolean {
  return (
    n.sourceCategory === "ADMIN" ||
    n.type === "ADMIN_MESSAGE" ||
    n.type === "ADMIN_BROADCAST"
  );
}

export default function ActivityPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    setFilter(new URLSearchParams(window.location.search).get("filter") ?? "");
  }, []);

  useEffect(() => {
    if (filter === undefined) return;
    setLoading(true);
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => {
        const list: Notification[] = Array.isArray(data)
          ? data
          : data.notifications ?? [];
        setItems(
          filter === "outcomes"
            ? list.filter(
                (n) =>
                  n.type === "OUTCOME_REMINDER" ||
                  n.type === "MUTUAL_INTEREST" ||
                  n.link?.includes("/reveals/")
              )
            : list
        );
        setLoading(false);
      });
  }, [filter]);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: new Date().toISOString() }))
    );
  }

  const { actions, admin, timeline } = useMemo(() => {
    const adminList = items.filter(isAdminItem);
    const adminIds = new Set(adminList.map((a) => a.id));
    const actionsList = items.filter(
      (n) => isActionItem(n) && !adminIds.has(n.id)
    );
    const actionIds = new Set(actionsList.map((a) => a.id));
    const timelineList = items.filter(
      (n) => !actionIds.has(n.id) && !adminIds.has(n.id)
    );
    return {
      actions: actionsList,
      admin: adminList,
      timeline: timelineList,
    };
  }, [items]);

  const groupedTimeline = useMemo(() => {
    const groups: Record<"today" | "yesterday" | "earlier", Notification[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    const source =
      timeline.length > 0 ? timeline : items.filter((n) => !isAdminItem(n));
    for (const n of source) {
      groups[dayBucket(n.createdAt)].push(n);
    }
    return groups;
  }, [timeline, items]);

  if (loading || filter === undefined) {
    return (
      <div>
        <PageHeaderV2 title="פעילות" subtitle="מה דורש פעולה ומה קרה" />
        <SkeletonBlockV2 lines={5} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        <PageHeaderV2 title="פעילות" subtitle="מה דורש פעולה ומה קרה" />
        <EmptyStateV2
          title={EMPTY_COPY.activity.title}
          description={EMPTY_COPY.activity.description}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeaderV2
        title="פעילות"
        subtitle="מה דורש פעולה ומה קרה"
        action={
          <ButtonV2 variant="secondary" className="text-sm" onClick={markAllRead}>
            סמן הכל כנקרא
          </ButtonV2>
        }
      />

      <section className="mb-8">
        <SectionHeader
          title={`דורש פעולה${actions.length > 0 ? ` (${actions.length})` : ""}`}
        />
        {actions.length === 0 ? (
          <Surface depth="secondary" className="p-4">
            <p className="text-sm text-v2-text-secondary">
              אין פעולות ממתינות כרגע.
            </p>
          </Surface>
        ) : (
          <div className="space-y-2">
            {actions.map((n) => (
              <Link
                key={n.id}
                href={n.link || "#"}
                className="block"
                onClick={() => {
                  void fetch("/api/notifications", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notificationId: n.id }),
                  });
                }}
              >
                <Surface
                  depth="raised"
                  className={cn(
                    "flex items-start justify-between gap-3 p-3",
                    !n.readAt && "border border-v2-signal/25"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-v2-text-primary">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 text-sm text-v2-text-secondary">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-v2-text-muted">
                      {formatRelative(n.createdAt)}
                    </p>
                  </div>
                  <BadgeV2 variant="signal">דורש פעולה</BadgeV2>
                </Surface>
              </Link>
            ))}
          </div>
        )}
      </section>

      {admin.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="הודעות REMATCHER" />
          <div className="space-y-2">
            {admin.map((n) => (
              <Surface key={n.id} depth="raised" className="p-3">
                <BadgeV2 variant="neutral">הודעה</BadgeV2>
                <p className="mt-2 font-medium text-v2-text-primary">{n.title}</p>
                {n.body && (
                  <p className="mt-1 text-sm text-v2-text-secondary">{n.body}</p>
                )}
              </Surface>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6">
        <SectionHeader title="מה קרה" />
        {(
          [
            ["today", "היום"],
            ["yesterday", "אתמול"],
            ["earlier", "מוקדם יותר"],
          ] as const
        ).map(([key, label]) =>
          groupedTimeline[key].length > 0 ? (
            <div key={key} className="mb-4">
              <p className="mb-2 text-xs font-medium text-v2-text-muted">
                {label}
              </p>
              <div className="space-y-2">
                {groupedTimeline[key].map((n) => (
                  <Link
                    key={n.id}
                    href={n.link || "#"}
                    className={cn("block", !n.link && "pointer-events-none")}
                  >
                    <Surface depth="secondary" className="p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-medium text-v2-text-primary">
                          {n.title}
                        </p>
                        <span className="shrink-0 text-xs text-v2-text-muted">
                          {new Date(n.createdAt).toLocaleTimeString("he-IL", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {n.body && (
                        <p className="mt-1 text-sm text-v2-text-secondary">
                          {n.body}
                        </p>
                      )}
                    </Surface>
                  </Link>
                ))}
              </div>
            </div>
          ) : null
        )}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ButtonV2,
  PageHeaderV2,
  SkeletonBlockV2,
  Surface,
} from "@/components/ui/brand-v2";
import { formatRelative, cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function ActivityPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => {
        setItems(data);
        setLoading(false);
      });
  }, []);

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

  if (loading) {
    return (
      <div>
        <PageHeaderV2 title="פעילות" subtitle="מקור האמת — לא Feed" />
        <SkeletonBlockV2 lines={5} />
      </div>
    );
  }

  return (
    <div>
      <PageHeaderV2
        title="פעילות"
        subtitle="מקור האמת — לא Feed"
        action={
          <ButtonV2 variant="secondary" className="text-sm" onClick={markAllRead}>
            סמן הכל כנקרא
          </ButtonV2>
        }
      />

      <div className="space-y-2">
        {items.map((n) => (
          <Link key={n.id} href={n.link ?? "/activity"} className="block">
            <Surface
              depth="raised"
              className={cn(
                "p-4 transition-opacity hover:opacity-95",
                !n.readAt && "border border-v2-signal/30 bg-v2-signal-soft/20"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-v2-text-primary">{n.title}</p>
                  <p className="text-sm text-v2-text-secondary">{n.body}</p>
                </div>
                {!n.readAt && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-v2-signal" />
                )}
              </div>
              <p className="mt-2 text-xs text-v2-text-muted">
                {formatRelative(n.createdAt)}
              </p>
            </Surface>
          </Link>
        ))}
        {items.length === 0 && (
          <p className="text-center text-sm text-v2-text-muted">אין התראות</p>
        )}
      </div>
    </div>
  );
}

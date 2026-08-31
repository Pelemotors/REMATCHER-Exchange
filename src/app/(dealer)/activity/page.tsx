"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, LoadingSpinner } from "@/components/ui/common";
import { formatRelative } from "@/lib/utils";

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
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="פעילות"
        subtitle="מקור האמת — לא Feed"
        action={
          <button className="btn-secondary text-sm" onClick={markAllRead}>
            סמן הכל כנקרא
          </button>
        }
      />

      <div className="space-y-2">
        {items.map((n) => (
          <Link
            key={n.id}
            href={n.link ?? "/activity"}
            className={`card block ${!n.readAt ? "border-signal/30 bg-signal-soft" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{n.title}</p>
                <p className="text-sm text-text-secondary">{n.body}</p>
              </div>
              {!n.readAt && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-signal" />
              )}
            </div>
            <p className="mt-2 text-xs text-text-muted">
              {formatRelative(n.createdAt)}
            </p>
          </Link>
        ))}
        {items.length === 0 && (
          <p className="text-center text-sm text-text-muted">אין התראות</p>
        )}
      </div>
    </div>
  );
}

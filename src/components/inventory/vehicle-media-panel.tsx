"use client";

import { useCallback, useEffect, useState } from "react";
import { Surface } from "@/components/ui/brand-v2";

type MediaItem = {
  id: string;
  category: "EXTERIOR" | "INTERIOR" | "OTHER";
  isPrimary: boolean;
  url: string;
  thumbUrl?: string;
};

const CATEGORY_LABEL: Record<MediaItem["category"], string> = {
  EXTERIOR: "חוץ",
  INTERIOR: "פנים",
  OTHER: "אחר",
};

export function VehicleMediaPanel({ vehicleId }: { vehicleId: string }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaReady, setMediaReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/inventory/media?vehicleId=${encodeURIComponent(vehicleId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      setMedia(Array.isArray(data.media) ? data.media : []);
      setMediaReady(Boolean(data.mediaReady));
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(category: MediaItem["category"], file: File) {
    setUploading(category);
    setError(null);
    try {
      const form = new FormData();
      form.append("vehicleId", vehicleId);
      form.append("category", category);
      form.append("file", file);
      const res = await fetch("/api/inventory/media", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "limit"
            ? "הגעת למגבלת התמונות לרכב"
            : data.error === "FILE_TOO_LARGE"
              ? "הקובץ גדול מדי"
              : data.error === "INVALID_IMAGE" || data.error === "invalid_type"
                ? "קובץ התמונה לא תקין"
                : "לא הצלחנו להעלות את התמונה"
        );
        return;
      }
      await load();
    } finally {
      setUploading(null);
    }
  }

  async function remove(mediaId: string) {
    setError(null);
    const res = await fetch(
      `/api/inventory/media?mediaId=${encodeURIComponent(mediaId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      setError("לא הצלחנו למחוק");
      return;
    }
    await load();
  }

  async function makePrimary(mediaId: string) {
    setError(null);
    const res = await fetch("/api/inventory/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setPrimary", mediaId }),
    });
    if (!res.ok) {
      setError("לא הצלחנו לעדכן תמונה ראשית");
      return;
    }
    await load();
  }

  const exterior = media.filter((m) => m.category === "EXTERIOR").length;
  const interior = media.filter((m) => m.category === "INTERIOR").length;

  return (
    <Surface depth="raised" className="mt-3 space-y-3 p-4">
      <div>
        <h4 className="font-semibold text-v2-text-primary">תמונות הרכב</h4>
        <p className="mt-1 text-sm text-v2-text-secondary">
          חובה לפחות תמונת חוץ אחת ותמונת פנים אחת לפני שהרכב נכנס לרשת.
        </p>
        <p className="mt-1 text-sm text-v2-text-muted" role="status">
          {mediaReady
            ? "מוכן לרשת"
            : exterior === 0 && interior === 0
              ? "חסרות תמונות"
              : exterior === 0
                ? "חסרה תמונת חוץ"
                : interior === 0
                  ? "חסרה תמונת פנים"
                  : "משלים…"}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-v2-text-muted">טוען תמונות…</p>
      ) : media.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2">
          {media.map((m) => (
            <li
              key={m.id}
              className="relative overflow-hidden rounded-xl border border-v2-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.thumbUrl || m.url}
                alt={`תמונת ${CATEGORY_LABEL[m.category]}`}
                className="h-28 w-full object-cover"
              />
              <div className="flex flex-wrap items-center justify-between gap-1 px-2 py-1.5 text-xs text-v2-text-secondary">
                <span>
                  {CATEGORY_LABEL[m.category]}
                  {m.isPrimary ? " · ראשית" : ""}
                </span>
                <span className="flex gap-2">
                  {!m.isPrimary && (
                    <button
                      type="button"
                      className="min-h-11 text-v2-signal"
                      onClick={() => void makePrimary(m.id)}
                    >
                      ראשית
                    </button>
                  )}
                  <button
                    type="button"
                    className="min-h-11 text-error"
                    onClick={() => void remove(m.id)}
                  >
                    מחק
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-v2-text-muted">עדיין אין תמונות לרכב זה.</p>
      )}

      <div className="flex flex-col gap-2">
        {(
          [
            ["EXTERIOR", "הוסף תמונת חוץ"],
            ["INTERIOR", "הוסף תמונת פנים"],
            ["OTHER", "הוסף עוד תמונה"],
          ] as const
        ).map(([cat, label]) => (
          <label
            key={cat}
            className={`flex min-h-14 cursor-pointer items-center justify-center rounded-xl border border-v2-border px-4 text-center text-base font-semibold ${
              cat === "OTHER"
                ? "bg-transparent text-v2-text-secondary"
                : "bg-v2-surface text-v2-text-primary"
            } ${uploading ? "opacity-60" : ""}`}
          >
            <span>{uploading === cat ? "מעלה…" : label}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={Boolean(uploading)}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(cat, file);
                e.target.value = "";
              }}
            />
          </label>
        ))}
      </div>
      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
      {uploading && (
        <p className="sr-only" role="status">
          מעלה תמונה
        </p>
      )}
    </Surface>
  );
}

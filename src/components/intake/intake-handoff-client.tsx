"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";

/**
 * Deep-link landing after OS Share handoff.
 * Web upload path also uses this for Field Test without native builds.
 */
export function IntakeHandoffClient() {
  const params = useSearchParams();
  const clientBatchId =
    params.get("clientBatchId") ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now()));
  const sourceParam = params.get("source") || "WEB_UPLOAD";
  const source =
    sourceParam === "IOS_SHARE" || sourceParam === "ANDROID_SHARE"
      ? sourceParam
      : "WEB_UPLOAD";

  const [batchId, setBatchId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("ממתין");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/intake/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            clientBatchId,
            source,
          }),
        });
        if (!res.ok) {
          setError("לא הצלחנו לפתוח קליטה — התחבר מחדש ונסה שוב");
          return;
        }
        const data = await res.json();
        setBatchId(data.batch?.id ?? null);
        setStatus(data.resumed ? "ממשיכים קליטה קיימת" : "מוכן לקליטה");
      } catch {
        setError("שגיאת רשת");
      }
    })();
  }, [clientBatchId, source]);

  async function onFiles(files: FileList | null) {
    if (!files?.length || !batchId || uploading) return;
    setUploading(true);
    setError(null);
    try {
      let order = 0;
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("batchId", batchId);
        form.append("originalOrder", String(order++));
        form.append("file", file);
        const res = await fetch("/api/intake/batch", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          setError("העלאת תמונה נכשלה");
          return;
        }
      }
      const ack = await fetch("/api/intake/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ack", batchId }),
      });
      if (!ack.ok) {
        setError("הקליטה לא אושרה בשרת");
        return;
      }
      setDone(true);
      setStatus("קיבלנו");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-5 py-6">
      <h1 className="text-2xl font-bold text-v2-warm-white">קליטת מלאי</h1>
      <p className="text-sm text-v2-text-secondary">
        זרוק לכאן תמונות מהגלריה או מ־WhatsApp. אנחנו נטפל בשאר.
      </p>
      <Surface depth="raised" className="space-y-3 p-4">
        <p className="text-sm text-v2-text-muted" role="status">
          {status}
        </p>
        {done ? (
          <p className="text-lg font-semibold text-success">קיבלנו ✓</p>
        ) : (
          <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border border-v2-border bg-v2-surface px-4 text-center font-semibold">
            {uploading ? "מעלה…" : "בחר תמונות"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={!batchId || uploading}
              onChange={(e) => void onFiles(e.target.files)}
            />
          </label>
        )}
        {error && (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        )}
        <ButtonV2 variant="ghost" href="/inventory" className="w-full">
          למלאי שלי
        </ButtonV2>
      </Surface>
    </div>
  );
}

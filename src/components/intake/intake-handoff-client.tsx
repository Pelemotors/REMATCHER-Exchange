"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";

type ShareStagingPlugin = {
  getPending: () => Promise<{
    pending: boolean;
    clientBatchId?: string;
    source?: string;
    text?: string;
    fileCount?: number;
  }>;
  consumeAndUpload: (opts: {
    clientBatchId?: string;
  }) => Promise<{
    ok: boolean;
    needsLogin?: boolean;
    batchId?: string;
    acknowledgedAt?: string;
    error?: string;
  }>;
  clearBatch: (opts: { clientBatchId: string }) => Promise<void>;
};

async function getShareStaging(): Promise<ShareStagingPlugin | null> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { registerPlugin } = await import("@capacitor/core");
    return registerPlugin<ShareStagingPlugin>("ShareStaging");
  } catch {
    return null;
  }
}

/**
 * Deep-link landing after OS Share handoff.
 * On Capacitor (Android / iOS): consumes durable staged files → authenticated upload → ACK.
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
  const shareText = params.get("text") || "";
  const staged = params.get("staged") === "1";
  const isNativeShare =
    staged || source === "ANDROID_SHARE" || source === "IOS_SHARE";

  const [batchId, setBatchId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("ממתין");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [caption, setCaption] = useState(shareText);
  const [nativeReady, setNativeReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const plugin = await getShareStaging();
      if (plugin && isNativeShare) {
        setNativeReady(true);
        setStatus("מעבד שיתוף מהמכשיר…");
        setUploading(true);
        try {
          const pending = await plugin.getPending();
          const id = pending.clientBatchId || clientBatchId;
          if (pending.text) setCaption(pending.text);
          const result = await plugin.consumeAndUpload({ clientBatchId: id });
          if (result.needsLogin) {
            setError("יש להתחבר באפליקציה ואז לשתף שוב מ־WhatsApp");
            setStatus("נדרשת התחברות");
            return;
          }
          if (!result.ok) {
            setError(result.error || "העלאת השיתוף נכשלה");
            return;
          }
          setBatchId(result.batchId ?? null);
          setDone(true);
          setStatus("קיבלנו");
        } catch (e) {
          setError("שגיאה בעיבוד השיתוף מהמכשיר");
        } finally {
          setUploading(false);
        }
        return;
      }

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
        const id = data.batch?.id ?? null;
        setBatchId(id);
        setStatus(data.resumed ? "ממשיכים קליטה קיימת" : "מוכן לקליטה");

        if (id && shareText.trim()) {
          await fetch("/api/intake/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "add_text",
              batchId: id,
              text: shareText,
            }),
          });
        }
      } catch {
        setError("שגיאת רשת");
      }
    })();
  }, [clientBatchId, source, shareText, isNativeShare]);

  async function onFiles(files: FileList | null) {
    if (!files?.length || !batchId || uploading) return;
    setUploading(true);
    setError(null);
    try {
      if (caption.trim()) {
        await fetch("/api/intake/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add_text",
            batchId,
            text: caption.trim(),
          }),
        });
      }
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
        {nativeReady
          ? "שיתוף מ־WhatsApp מתעבד אוטומטית."
          : "זרוק לכאן תמונות מהגלריה או מ־WhatsApp. אנחנו נטפל בשאר."}
      </p>
      <Surface depth="raised" className="space-y-3 p-4">
        <p className="text-sm text-v2-text-muted" role="status">
          {status}
        </p>
        {done ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-success">קיבלנו ✓</p>
            <ButtonV2 variant="primary" href="/intake/review" className="w-full">
              לבדיקת קליטות
            </ButtonV2>
          </div>
        ) : !nativeReady ? (
          <>
            <label className="block space-y-1 text-sm">
              <span className="text-v2-text-muted">טקסט מהשיתוף (לוחית / מחיר)</span>
              <textarea
                className="min-h-20 w-full rounded-xl border border-v2-border bg-v2-surface px-3 py-2 text-v2-warm-white"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="לדוגמה: 12-345-67 יד 2 85000 ק״מ מחיר 145000"
                disabled={uploading}
              />
            </label>
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
          </>
        ) : (
          <p className="text-sm text-v2-text-muted">
            {uploading ? "מעלה מהשיתוף…" : "ממתין"}
          </p>
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

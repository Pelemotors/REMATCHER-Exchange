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
 * On Capacitor: consumes durable staged files → authenticated upload → ACK.
 * Web upload path for Field Test without native builds.
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
  const [receivedSummary, setReceivedSummary] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const plugin = await getShareStaging();
      if (plugin && isNativeShare) {
        if (cancelled) return;
        setNativeReady(true);
        setStatus("מעבד שיתוף מהמכשיר…");
        setUploading(true);
        setError(null);
        try {
          const pending = await plugin.getPending();
          const id = pending.clientBatchId || clientBatchId;
          if (pending.text) setCaption(pending.text);
          const fileCount = pending.fileCount ?? 0;
          const hasText = Boolean((pending.text || shareText || "").trim());
          const parts: string[] = [];
          if (fileCount > 0) {
            parts.push(fileCount === 1 ? "תמונה אחת" : `${fileCount} תמונות`);
          }
          if (hasText) parts.push("פרטי רכב");
          setReceivedSummary(
            parts.length > 0 ? parts.join(" ו") : "השיתוף"
          );

          const result = await plugin.consumeAndUpload({ clientBatchId: id });
          if (cancelled) return;
          if (result.needsLogin) {
            const callback = `/intake/handoff?${new URLSearchParams({
              clientBatchId: id,
              source,
              staged: "1",
              ...(pending.text || shareText
                ? { text: (pending.text || shareText).slice(0, 1500) }
                : {}),
            }).toString()}`;
            window.location.href = `/login?callbackUrl=${encodeURIComponent(callback)}`;
            return;
          }
          if (!result.ok) {
            setError(result.error || "העלאת השיתוף נכשלה");
            return;
          }
          setBatchId(result.batchId ?? null);
          setDone(true);
          setStatus("קיבלנו");
        } catch {
          if (!cancelled) setError("שגיאה בעיבוד השיתוף מהמכשיר");
        } finally {
          if (!cancelled) setUploading(false);
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
          if (!cancelled) {
            setError("לא הצלחנו לפתוח קליטה — התחבר מחדש ונסה שוב");
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
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
        if (!cancelled) setError("שגיאת רשת");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientBatchId, source, shareText, isNativeShare, retryToken]);

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
      setReceivedSummary(
        files.length === 1 ? "תמונה אחת" : `${files.length} תמונות`
      );
      setDone(true);
      setStatus("קיבלנו");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <h1 className="text-2xl font-bold text-v2-warm-white">קליטת מלאי</h1>
      <p className="text-sm text-v2-text-secondary">
        {nativeReady
          ? "שיתוף מ־WhatsApp מתעבד אוטומטית."
          : "בחר תמונות מהגלריה או צלם — אנחנו נטפל בשאר."}
      </p>
      <Surface depth="raised" className="space-y-3 p-4">
        <p className="text-sm text-v2-text-muted" role="status">
          {status}
        </p>
        {done ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-success">קיבלנו 👍</p>
            {receivedSummary ? (
              <p className="text-sm text-v2-text-secondary">{receivedSummary}</p>
            ) : null}
            <p className="text-sm text-v2-text-secondary">REMATCHER מטפלת בזה.</p>
            <ButtonV2 variant="primary" href="/intake/review" className="w-full">
              לבדיקת קליטות
            </ButtonV2>
          </div>
        ) : !nativeReady ? (
          <>
            <label className="block space-y-1 text-sm">
              <span className="text-v2-text-muted">טקסט מהשיתוף (לוחית / מחיר)</span>
              <textarea
                className="min-h-20 w-full rounded-xl border border-v2-border bg-v2-surface px-3 py-2 text-base text-v2-warm-white"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="לדוגמה: 12-345-67 יד 2 85000 ק״מ מחיר 145000"
                disabled={uploading}
              />
            </label>
            <div className="flex flex-col gap-2">
              <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border border-v2-border bg-v2-surface px-4 text-center text-base font-semibold">
                {uploading ? "מעלה…" : "בחר מהגלריה"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  disabled={!batchId || uploading}
                  onChange={(e) => void onFiles(e.target.files)}
                />
              </label>
              <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border border-v2-border bg-transparent px-4 text-center text-base font-semibold text-v2-text-secondary">
                {uploading ? "מעלה…" : "צלם רכב"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="sr-only"
                  disabled={!batchId || uploading}
                  onChange={(e) => void onFiles(e.target.files)}
                />
              </label>
            </div>
          </>
        ) : (
          <p className="text-sm text-v2-text-muted">
            {uploading ? "מעלה מהשיתוף…" : "ממתין"}
          </p>
        )}
        {error && (
          <div className="space-y-2">
            <p className="text-sm text-error" role="alert">
              {error}
            </p>
            {nativeReady && !done ? (
              <ButtonV2
                variant="primary"
                className="w-full"
                disabled={uploading}
                onClick={() => setRetryToken((n) => n + 1)}
              >
                נסה שוב
              </ButtonV2>
            ) : null}
          </div>
        )}
        <ButtonV2 variant="ghost" href="/inventory" className="w-full">
          למלאי שלי
        </ButtonV2>
      </Surface>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAgentWorkspaceOptional } from "@/components/assistant/agent-workspace-provider";
import { formatIsraeliPlate } from "@/services/intake/discovery";
import styles from "./intake-conversation.module.css";

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
};

type CandidateDto = {
  id: string;
  status: string;
  detectedPlate: string | null;
  plateNormalized: string | null;
  dealerIntent: string | null;
  committedVehicleId: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  thumbUrl: string | null;
  govState: string | null;
};

type DemandDraftDto = {
  rawText?: string;
  summaryHe?: string;
  parsed?: unknown;
  status?: string;
  demandId?: string | null;
};

type BatchDto = {
  id: string;
  status: string;
  demandDraft?: DemandDraftDto | null;
  media: Array<{
    id: string;
    thumbUrl: string | null;
    url: string | null;
    originalOrder: number;
    categoryHint: string | null;
    discovery: unknown;
  }>;
  candidates: CandidateDto[];
  unresolvedMedia: Array<{
    id: string;
    thumbUrl: string | null;
    originalOrder: number;
  }>;
};

const INTENTS = [
  { value: "OWNED", label: "למלאי", primary: true },
  { value: "OFFERED_TO_ME", label: "מציעים לי", primary: false },
  { value: "TRADE_IN_CANDIDATE", label: "טרייד", primary: false },
  { value: "EXTERNAL", label: "רק בודק", primary: false },
] as const;

const INTENT_LABEL: Record<string, string> = {
  OWNED: "למלאי",
  OFFERED_TO_ME: "מציעים לי",
  TRADE_IN_CANDIDATE: "טרייד",
  EXTERNAL: "רק בודק",
};

async function getShareStaging(): Promise<ShareStagingPlugin | null> {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    return registerPlugin<ShareStagingPlugin>("ShareStaging");
  } catch {
    return null;
  }
}

function vehicleLabel(c: CandidateDto) {
  const name = [c.make, c.model].filter(Boolean).join(" ");
  const plate = formatIsraeliPlate(c.plateNormalized || c.detectedPlate);
  if (name && c.year) return { title: name, meta: `${c.year}${plate ? `\n${plate}` : ""}` };
  if (name) return { title: name, meta: plate ?? "מזהה חלקי" };
  if (plate) return { title: plate, meta: c.year ? String(c.year) : "מזהה לפי לוחית" };
  return { title: "רכב שעדיין לא זוהה בוודאות", meta: "צריך ממך פרט קטן" };
}

export function IntakeHandoffClient() {
  const params = useSearchParams();
  const agent = useAgentWorkspaceOptional();
  const sourceParam = params.get("source") || "WEB_UPLOAD";
  const source =
    sourceParam === "IOS_SHARE" || sourceParam === "ANDROID_SHARE"
      ? sourceParam
      : "WEB_UPLOAD";
  const shareText = params.get("text") || "";
  const staged = params.get("staged") === "1";
  const isNativeShare =
    staged || source === "ANDROID_SHARE" || source === "IOS_SHARE";

  const [clientBatchId] = useState(() => {
    const fromUrl = params.get("clientBatchId");
    if (fromUrl) return fromUrl;
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return String(Date.now());
  });

  const [batchId, setBatchId] = useState<string | null>(params.get("batchId"));
  const [phase, setPhase] = useState<"capture" | "conversation">(
    params.get("batchId") ? "conversation" : "capture"
  );
  const [caption, setCaption] = useState(shareText);
  const [showPaste, setShowPaste] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [localThumbs, setLocalThumbs] = useState<string[]>([]);
  const [mediaCount, setMediaCount] = useState(0);
  const [batch, setBatch] = useState<BatchDto | null>(null);
  const [composer, setComposer] = useState("");
  const [busyIntent, setBusyIntent] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [demandBusy, setDemandBusy] = useState(false);
  const [demandConfirmed, setDemandConfirmed] = useState(false);
  const seenCandidateCount = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const identified = batch?.candidates ?? [];
  const unresolved = batch?.unresolvedMedia ?? [];
  const processing =
    phase === "conversation" &&
    (!batch ||
      ["RECEIVED", "PROCESSING", "ACKNOWLEDGED"].includes(batch.status) ||
      identified.some((c) =>
        ["DETECTED", "IDENTIFYING"].includes(c.status)
      ));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [identified.length, phase, processing, unresolved.length]);

  useEffect(() => {
    if (phase !== "capture" || isNativeShare) return;
    let cancelled = false;
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
          if (!cancelled) setError("לא הצלחנו לפתוח קליטה — התחבר מחדש ונסה שוב");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setBatchId(data.batch?.id ?? null);
      } catch {
        if (!cancelled) setError("שגיאת רשת");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientBatchId, source, isNativeShare, retryToken, phase]);

  useEffect(() => {
    if (!isNativeShare || phase === "conversation") return;
    let cancelled = false;
    void (async () => {
      const plugin = await getShareStaging();
      if (!plugin) return;
      setUploading(true);
      setError(null);
      try {
        const pending = await plugin.getPending();
        const id = pending.clientBatchId || clientBatchId;
        if (pending.text) setCaption(pending.text);
        const fileCount = pending.fileCount ?? 0;
        setMediaCount(fileCount);
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
        setPhase("conversation");
        if (result.batchId) {
          history.replaceState(null, "", `/intake/handoff?batchId=${result.batchId}`);
        }
      } catch {
        if (!cancelled) setError("שגיאה בעיבוד השיתוף מהמכשיר");
      } finally {
        if (!cancelled) setUploading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientBatchId, source, shareText, isNativeShare, retryToken, phase]);

  useEffect(() => {
    if (!batchId || phase !== "conversation") return;
    let cancelled = false;
    async function pull() {
      const res = await fetch(`/api/intake/batch?batchId=${batchId}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as BatchDto;
      if (cancelled) return;
      setBatch(data);
      setMediaCount(data.media.length || mediaCount);
      if (data.candidates.length > seenCandidateCount.current) {
        seenCandidateCount.current = data.candidates.length;
      }
    }
    void pull();
    const t = window.setInterval(() => void pull(), 1600);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [batchId, phase, mediaCount]);

  async function uploadWithConcurrency(files: File[], id: string) {
    const items = Array.from(files);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        const file = items[i]!;
        const form = new FormData();
        form.append("batchId", id);
        form.append("originalOrder", String(i));
        form.append("file", file);
        const res = await fetch("/api/intake/batch", { method: "POST", body: form });
        if (!res.ok) throw new Error("upload_failed");
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, () => worker()));
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length || !batchId || uploading) return;
    const list = Array.from(files);
    setLocalThumbs(list.slice(0, 4).map((f) => URL.createObjectURL(f)));
    setMediaCount(list.length);
    setPhase("conversation");
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
      await uploadWithConcurrency(list, batchId);
      const ack = await fetch("/api/intake/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ack", batchId }),
      });
      if (!ack.ok) {
        setError("הקליטה לא אושרה בשרת");
        return;
      }
      history.replaceState(null, "", `/intake/handoff?batchId=${batchId}`);
    } catch {
      setError("העלאת תמונה נכשלה");
    } finally {
      setUploading(false);
    }
  }

  async function submitTextOnly() {
    if (!batchId || uploading || !caption.trim()) return;
    setPhase("conversation");
    setUploading(true);
    setError(null);
    setMediaCount(0);
    try {
      await fetch("/api/intake/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_text",
          batchId,
          text: caption.trim(),
        }),
      });
      const ack = await fetch("/api/intake/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ack", batchId }),
      });
      if (!ack.ok) {
        setError("הקליטה לא אושרה בשרת");
        return;
      }
      history.replaceState(null, "", `/intake/handoff?batchId=${batchId}`);
    } catch {
      setError("שליחת הטקסט נכשלה");
    } finally {
      setUploading(false);
    }
  }

  async function sendIntent(opts: {
    candidateId?: string;
    intent?: string;
    message?: string;
  }) {
    if (!batchId) return;
    setBusyIntent(opts.candidateId || opts.intent || "text");
    setError(null);
    try {
      const res = await fetch("/api/intake/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, ...opts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError("לא הצלחתי לשמור את הבחירה");
        return;
      }
      if (data.results) {
        const getRes = await fetch(`/api/intake/batch?batchId=${batchId}`);
        if (getRes.ok) setBatch((await getRes.json()) as BatchDto);
      }
    } finally {
      setBusyIntent(null);
    }
  }

  async function publishCatalog(vehicleId: string) {
    const res = await fetch("/api/catalog/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === "missing_retail") {
        setPriceDraft((p) => ({ ...p, [vehicleId]: p[vehicleId] ?? "" }));
      }
      setError(data.message || "פרסום לקטלוג נכשל");
      return;
    }
    setError(null);
  }

  async function saveRetailAndPublish(vehicleId: string) {
    const raw = priceDraft[vehicleId];
    const n = Number(String(raw || "").replace(/\D/g, ""));
    if (!n) {
      setError("חסר מחיר ללקוח");
      return;
    }
    await fetch("/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId, fields: { retailPrice: n } }),
    });
    await publishCatalog(vehicleId);
  }

  async function confirmDemandDraft() {
    const draft = batch?.demandDraft;
    if (!draft?.rawText || demandBusy) return;
    setDemandBusy(true);
    setError(null);
    try {
      const parsedRes = await fetch("/api/demands/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: draft.rawText }),
      });
      const parsed = await parsedRes.json();
      if (!parsedRes.ok || !parsed.demandId) {
        setError("לא הצלחתי לשמור את הביקוש");
        return;
      }
      const confirmRes = await fetch("/api/demands/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demandId: parsed.demandId,
          confirmed: parsed.parsed ?? draft.parsed,
          publishMode: "network",
        }),
      });
      if (!confirmRes.ok) {
        setError("האישור לא נשמר");
        return;
      }
      setDemandConfirmed(true);
      const getRes = await fetch(`/api/intake/batch?batchId=${batchId}`);
      if (getRes.ok) setBatch((await getRes.json()) as BatchDto);
    } finally {
      setDemandBusy(false);
    }
  }

  const thumbs = useMemo(() => {
    if (batch?.media?.length) return batch.media.map((m) => m.thumbUrl || m.url || "");
    return localThumbs;
  }, [batch, localThumbs]);

  const readyCount = identified.filter(
    (c) => c.status === "READY" || c.status === "COMMITTED" || c.make
  ).length;

  return (
    <div className={styles.page} dir="rtl">
      <div className={styles.column}>
        <header className={styles.header}>
          <div className={styles.headerMark} aria-hidden>
            R
          </div>
          <div>
            <h1 className={styles.headerTitle}>קליטת רכב</h1>
            <p className={styles.headerSub}>REMATCHER Exchange</p>
          </div>
        </header>

        <div className={styles.scroll} ref={scrollRef}>
          {phase === "capture" ? (
            <div className={styles.capture}>
              <p className={styles.lead}>שלח לי את הרכב — אני כבר אטפל בשאר.</p>
              {isNativeShare ? (
                <p className={styles.headerSub}>
                  {uploading ? "מעלה מהשיתוף…" : "שיתוף מ־WhatsApp מתעבד אוטומטית."}
                </p>
              ) : (
                <div className={styles.captureActions}>
                  <label className={styles.primaryAction}>
                    {uploading ? "מעלה…" : "בחר מהגלריה"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className={styles.hiddenInput}
                      disabled={!batchId || uploading}
                      onChange={(e) => void onFiles(e.target.files)}
                    />
                  </label>
                  <label className={styles.secondaryAction}>
                    {uploading ? "מעלה…" : "צלם רכב"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      className={styles.hiddenInput}
                      disabled={!batchId || uploading}
                      onChange={(e) => void onFiles(e.target.files)}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.tertiaryAction}
                    onClick={() => setShowPaste((v) => !v)}
                  >
                    הדבק טקסט / מידע
                  </button>
                  {showPaste ? (
                    <>
                      <textarea
                        className={styles.pasteBox}
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="לדוגמה: מחפש CX5 22+ עד 140"
                      />
                      <button
                        type="button"
                        className={styles.primaryAction}
                        disabled={!caption.trim() || uploading || !batchId}
                        onClick={() => void submitTextOnly()}
                      >
                        {uploading ? "שולח…" : "שלח ל-REMATCHER"}
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className={styles.userRow}>
                <div className={styles.userBubble}>
                  <div className={styles.mediaCluster}>
                    {thumbs.slice(0, 4).map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="" className={styles.thumb} />
                    ))}
                    {mediaCount > 4 ? (
                      <div className={styles.moreCount}>+{mediaCount - 4}</div>
                    ) : null}
                  </div>
                  <div className={styles.mediaCaption}>
                    {mediaCount === 1 ? "תמונה אחת" : `${mediaCount} תמונות`}
                  </div>
                </div>
              </div>

              <div className={styles.agentRow}>
                <div className={styles.agentBubble}>
                  {processing ? (
                    <>
                      <span className={styles.processingDot} />
                      קיבלתי 👍
                      {"\n"}
                      {caption.trim() && !localThumbs.length
                        ? "בודק מה הלקוח מחפש..."
                        : "בודק את הרכבים..."}
                    </>
                  ) : (
                    <>
                      {mediaCount
                        ? `קיבלתי ${mediaCount} תמונות.`
                        : "קיבלתי את ההודעה."}
                      {identified.length
                        ? `\nזיהיתי כאן ${identified.length} רכבים 👇`
                        : ""}
                      {readyCount && readyCount !== identified.length
                        ? `\n${readyCount} מוכנים להחלטה.`
                        : ""}
                    </>
                  )}
                </div>
              </div>

              {batch?.demandDraft?.summaryHe && !demandConfirmed ? (
                <div className={styles.card}>
                  <p className={styles.cardTitle}>ביקוש לקוח</p>
                  <p className={styles.cardMeta} style={{ whiteSpace: "pre-line" }}>
                    {batch.demandDraft.summaryHe}
                  </p>
                  <div className={styles.actions} style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className={`${styles.action} ${styles.actionPrimary}`}
                      disabled={demandBusy}
                      onClick={() => void confirmDemandDraft()}
                    >
                      {demandBusy ? "שומר…" : "נכון, שמור"}
                    </button>
                  </div>
                </div>
              ) : null}

              {demandConfirmed ? (
                <div className={`${styles.card} ${styles.cardDone}`}>
                  <p className={styles.cardTitle}>✓ הביקוש נשמר</p>
                  <p className={styles.cardMeta}>
                    REMATCHER תחפש עכשיו וגם בהמשך, בלי שתצטרך לחפש מחדש.
                  </p>
                </div>
              ) : null}

              {identified.length >= 2 &&
              identified.some((c) => !c.dealerIntent) ? (
                <div className={styles.shortcut}>
                  <button
                    type="button"
                    className={styles.shortcutBtn}
                    onClick={() => void sendIntent({ intent: "OWNED", message: "כולם למלאי" })}
                  >
                    כולם למלאי
                  </button>
                </div>
              ) : null}

              {identified.map((c) => {
                const v = vehicleLabel(c);
                if (c.dealerIntent && c.committedVehicleId) {
                  return (
                    <div key={c.id} className={`${styles.card} ${styles.cardDone}`}>
                      <p className={styles.cardTitle}>
                        ✓ {v.title}
                        {c.year ? ` · ${c.year}` : ""}
                      </p>
                      <p className={styles.cardMeta}>
                        {INTENT_LABEL[c.dealerIntent] ?? c.dealerIntent}
                      </p>
                      {c.dealerIntent === "OWNED" ? (
                        <div className={styles.followups}>
                          <button
                            type="button"
                            className={styles.follow}
                            onClick={() => {
                              agent?.openAgent({
                                vehicleId: c.committedVehicleId!,
                                preferFocusOnMobile: true,
                              });
                              void agent?.send("מה יש לי עליו?");
                            }}
                          >
                            מה יש לי עליו?
                          </button>
                          <button
                            type="button"
                            className={styles.follow}
                            onClick={() => void publishCatalog(c.committedVehicleId!)}
                          >
                            פרסם גם בקטלוג
                          </button>
                        </div>
                      ) : (
                        <div className={styles.followups}>
                          <button
                            type="button"
                            className={styles.follow}
                            onClick={() => {
                              agent?.openAgent({
                                vehicleId: c.committedVehicleId!,
                                preferFocusOnMobile: true,
                              });
                              void agent?.send("מה יש לי עליו?");
                            }}
                          >
                            מה יש לי עליו?
                          </button>
                        </div>
                      )}
                      {priceDraft[c.committedVehicleId] != null ? (
                        <div className={styles.followups}>
                          <input
                            className={styles.composerInput}
                            inputMode="numeric"
                            placeholder="מחיר ללקוח"
                            value={priceDraft[c.committedVehicleId] ?? ""}
                            onChange={(e) =>
                              setPriceDraft((p) => ({
                                ...p,
                                [c.committedVehicleId!]: e.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className={styles.follow}
                            onClick={() => void saveRetailAndPublish(c.committedVehicleId!)}
                          >
                            הוסף מחיר ופרסם
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                }
                return (
                  <div key={c.id} className={styles.card}>
                    {c.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbUrl} alt="" className={styles.cardThumb} />
                    ) : (
                      <div className={styles.cardThumb} />
                    )}
                    <div>
                      <p className={styles.cardTitle}>{v.title}</p>
                      <p className={styles.cardMeta}>{v.meta}</p>
                      {c.status === "NEEDS_INFO" && !c.make ? (
                        <p className={styles.cardAsk}>
                          את הרכב הזה עוד לא הצלחתי לזהות בוודאות. יש לך מספר רכב?
                        </p>
                      ) : (
                        <p className={styles.cardAsk}>מה הרכב הזה בשבילך?</p>
                      )}
                      <div className={styles.actions}>
                        {INTENTS.map((intent) => (
                          <button
                            key={intent.value}
                            type="button"
                            className={`${styles.action} ${intent.primary ? styles.actionPrimary : ""}`}
                            disabled={busyIntent != null}
                            onClick={() =>
                              void sendIntent({
                                candidateId: c.id,
                                intent: intent.value,
                              })
                            }
                          >
                            {intent.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className={styles.action}
                          disabled={busyIntent != null}
                          onClick={() =>
                            void sendIntent({
                              candidateId: c.id,
                              intent: "DISCARD",
                            })
                          }
                        >
                          מחק / טעות
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {unresolved.length > 0 ? (
                <div className={styles.agentRow}>
                  <div className={styles.agentBubble}>
                    נשארו לי {unresolved.length} תמונות שאני עדיין לא בטוח לאיזה רכב הן שייכות.
                    <div className={styles.mediaCluster} style={{ marginTop: 8 }}>
                      {unresolved.slice(0, 4).map((m) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={m.id}
                          src={m.thumbUrl || ""}
                          alt=""
                          className={styles.thumb}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}

          {error ? (
            <p className={styles.error} role="alert">
              {error}
              {isNativeShare && phase === "capture" ? (
                <>
                  {" "}
                  <button type="button" className={styles.follow} onClick={() => setRetryToken((n) => n + 1)}>
                    נסה שוב
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className={styles.composerWrap}>
          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              const text = composer.trim();
              if (!text || !batchId) return;
              setComposer("");
              if (phase === "capture") return;
              if (batch?.demandDraft && !demandConfirmed) {
                void (async () => {
                  await fetch("/api/intake/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "add_text",
                      batchId,
                      text,
                    }),
                  });
                  await fetch("/api/intake/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "ack", batchId }),
                  });
                  const getRes = await fetch(`/api/intake/batch?batchId=${batchId}`);
                  if (getRes.ok) setBatch((await getRes.json()) as BatchDto);
                })();
                return;
              }
              void sendIntent({ message: text });
            }}
          >
            <textarea
              className={styles.composerInput}
              rows={1}
              placeholder="כתוב ל-REMATCHER..."
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
            />
            <button className={styles.send} type="submit" disabled={!composer.trim() || phase === "capture"}>
              ➤
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

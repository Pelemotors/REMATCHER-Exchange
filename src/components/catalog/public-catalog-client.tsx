"use client";

import { useEffect, useState } from "react";
import styles from "./catalog-public.module.css";

export function PublicCatalogTracker({
  slug,
  eventType,
  publicId,
}: {
  slug: string;
  eventType: "CATALOG_VIEW" | "VEHICLE_VIEW";
  publicId?: string;
}) {
  useEffect(() => {
    const clientEventId = crypto.randomUUID();
    void fetch(`/api/public/catalog/${slug}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventType,
        publicId,
        clientEventId,
        referrerHost: document.referrer || null,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [slug, eventType, publicId]);
  return null;
}

export function PublicLeadForm({
  slug,
  publicId,
  vehicleTitle,
}: {
  slug: string;
  publicId?: string;
  vehicleTitle?: string;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/catalog/${slug}/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          message,
          publicId,
          company,
          clientSubmissionId: crypto.randomUUID(),
          consentVersion: "catalog-lead-v1",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (body?.error === "rate_limited") {
          setError("נשלחה פנייה לאחרונה. נסה שוב מאוחר יותר.");
        } else if (body?.error === "invalid_phone") {
          setError("מספר הטלפון אינו תקין.");
        } else {
          setError("לא הצלחנו לשלוח את הפנייה. נסה שוב.");
        }
        return;
      }
      setDone(true);
    } catch {
      setError("לא הצלחנו לשלוח את הפנייה. נסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.leadCard} onSubmit={onSubmit}>
      <h2 className={styles.leadTitle}>השאר פנייה</h2>
      <p className={styles.leadHint}>
        {vehicleTitle
          ? `נחזור אליך לגבי ${vehicleTitle}. הפרטים שלך מיועדים לסוכנות בלבד.`
          : "נחזור אליך בהקדם. הפרטים שלך מיועדים לסוכנות בלבד."}
      </p>
      {done ? (
        <p>קיבלנו את הפנייה. ניצור קשר בהקדם.</p>
      ) : (
        <>
          <label className={styles.honeypot}>
            חברה
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </label>
          <div className={styles.leadField}>
            <label htmlFor="lead-name">שם מלא</label>
            <input
              id="lead-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className={styles.leadField}>
            <label htmlFor="lead-phone">טלפון</label>
            <input
              id="lead-phone"
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className={styles.leadField}>
            <label htmlFor="lead-message">הודעה (אופציונלי)</label>
            <textarea
              id="lead-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          {error && <p className={styles.leadError}>{error}</p>}
          <button className={styles.contactBtnPrimary} type="submit" disabled={busy}>
            {busy ? "שולח…" : "שלח פנייה"}
          </button>
        </>
      )}
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ButtonV2, PageHeaderV2, Surface } from "@/components/ui/brand-v2";
import { PushSettings } from "@/components/pwa/push-settings";
import { BRAND, COPY } from "@/config/brand";
import styles from "./onboarding.module.css";

type Step = "intro" | "profile" | "inventory" | "demand" | "push" | "done";

interface SetupStatus {
  profileComplete: boolean;
  hasInventory: boolean;
  hasActiveDemand: boolean;
  shouldShowOnboarding: boolean;
}

export function DealerOnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [profile, setProfile] = useState({
    city: "",
    region: "",
    phone: "",
  });

  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((data: SetupStatus) => {
        setStatus(data);
        if (!data.shouldShowOnboarding) {
          router.replace("/home");
          return;
        }
        if (data.profileComplete) setStep("inventory");
        else if (data.hasInventory && !data.hasActiveDemand) setStep("demand");
        else if (data.hasInventory && data.hasActiveDemand) setStep("push");
        setLoading(false);
      });
    fetch("/api/account/context")
      .then((r) => (r.ok ? r.json() : null))
      .then((ctx) => {
        if (ctx) {
          setProfile((p) => ({
            ...p,
            city: ctx.city ?? "",
            region: ctx.region ?? "",
            phone: ctx.phone ?? "",
          }));
        }
      });
  }, [router]);

  async function advance(nextStep: Step, apiStep?: string) {
    if (apiStep) {
      setSaving(true);
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: apiStep }),
      });
      setSaving(false);
    }
    if (nextStep === "done") {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "complete" }),
      });
      router.replace("/home");
      return;
    }
    setStep(nextStep);
  }

  async function saveProfile() {
    setSaving(true);
    await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setSaving(false);
    await advance("inventory", "profile");
  }

  async function skipOnboarding() {
    setSaving(true);
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "dismiss" }),
    });
    setSaving(false);
    router.replace("/home");
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <p className="text-v2-text-secondary">טוען...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeaderV2
        eyebrow={BRAND.product}
        title="ברוכים הבאים"
        subtitle="הגדרה קצרה — ואז REMATCHER עובד בשבילך"
      />

      {step === "intro" && (
        <Surface depth="raised" className={styles.panel}>
          <h2 className={styles.stepTitle}>מה זה {BRAND.product}?</h2>
          <ul className={styles.bulletList}>
            <li>רשת פרטית של סוחרים — בלי שוק ציבורי ובלי חשיפת מלאי</li>
            <li>אתה מוסיף מלאי ופותח חיפושים — המערכת מוצאת התאמות</li>
            <li>כשיש עניין הדדי נוצר {COPY.reveal} — ואז אפשר לפעול מסחרית</li>
            <li>התראות Push עוזרות שלא לפספס הזדמנויות</li>
          </ul>
          <div className={styles.actions}>
            <ButtonV2 variant="signal" disabled={saving} onClick={() => advance("profile", "intro")}>
              המשך
            </ButtonV2>
            <button type="button" className={styles.skipLink} onClick={skipOnboarding}>
              דלג — כבר מכיר את המערכת
            </button>
          </div>
        </Surface>
      )}

      {step === "profile" && (
        <Surface depth="raised" className={styles.panel}>
          <h2 className={styles.stepTitle}>פרטי העסק</h2>
          <p className={styles.stepDesc}>עדכן פרטים ליצירת קשר מדויקת</p>
          <div className={styles.form}>
            <label className="label">עיר</label>
            <input
              className="input"
              value={profile.city}
              onChange={(e) => setProfile({ ...profile, city: e.target.value })}
            />
            <label className="label">אזור</label>
            <input
              className="input"
              value={profile.region}
              onChange={(e) => setProfile({ ...profile, region: e.target.value })}
            />
            <label className="label">טלפון</label>
            <input
              className="input"
              dir="ltr"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
          </div>
          <div className={styles.actions}>
            <ButtonV2 variant="signal" disabled={saving} onClick={saveProfile}>
              שמור והמשך
            </ButtonV2>
            <ButtonV2 variant="secondary" disabled={saving} onClick={() => advance("inventory")}>
              דלג
            </ButtonV2>
          </div>
        </Surface>
      )}

      {step === "inventory" && (
        <Surface depth="raised" className={styles.panel}>
          <h2 className={styles.stepTitle}>הוסף מלאי</h2>
          <p className={styles.stepDesc}>
            בלי מלאי אין התאמות למוכר. הוסף רכבים או ייבא מקובץ.
          </p>
          <div className={styles.actions}>
            <ButtonV2 variant="signal" href="/inventory" onClick={() => advance("demand", "inventory")}>
              לעמוד המלאי
            </ButtonV2>
            <ButtonV2 variant="secondary" disabled={saving} onClick={() => advance("demand", "inventory")}>
              {status?.hasInventory ? "יש לי מלאי — המשך" : "אוסיף מאוחר יותר"}
            </ButtonV2>
          </div>
        </Surface>
      )}

      {step === "demand" && (
        <Surface depth="raised" className={styles.panel}>
          <h2 className={styles.stepTitle}>פתח חיפוש ראשון</h2>
          <p className={styles.stepDesc}>
            חיפוש מגדיר מה אתה מחפש — REMATCHER יעבוד ברקע ויודיע כשיש התאמה.
          </p>
          <div className={styles.actions}>
            <ButtonV2 variant="signal" href="/demand?new=1" onClick={() => advance("push", "demand")}>
              פתח חיפוש
            </ButtonV2>
            <ButtonV2 variant="secondary" disabled={saving} onClick={() => advance("push", "demand")}>
              {status?.hasActiveDemand ? "יש לי חיפוש — המשך" : "אפתח מאוחר יותר"}
            </ButtonV2>
          </div>
        </Surface>
      )}

      {step === "push" && (
        <Surface depth="raised" className={styles.panel}>
          <h2 className={styles.stepTitle}>התראות Push</h2>
          <p className={styles.stepDesc}>
            קבל התראה כשיש התאמה, הזדמנות או חיבור — ישירות למסך הרלוונטי.
          </p>
          <PushSettings compact />
          <div className={styles.actions}>
            <ButtonV2 variant="signal" disabled={saving} onClick={() => advance("done", "push")}>
              סיים והיכנס ל-{BRAND.product}
            </ButtonV2>
            <button type="button" className={styles.skipLink} onClick={() => advance("done", "push")}>
              בלי Push כרגע
            </button>
          </div>
        </Surface>
      )}

      <p className={styles.footerNote}>
        <Link href="/home" className="text-v2-signal text-small">
          חזרה לבית
        </Link>
      </p>
    </div>
  );
}

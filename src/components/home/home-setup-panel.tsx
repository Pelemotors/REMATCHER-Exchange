"use client";

import Link from "next/link";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";
import { BRAND } from "@/config/brand";
import styles from "./home-v2.module.css";

interface SetupStatus {
  hasInventory: boolean;
  hasActiveDemand: boolean;
  pushEnabled: boolean;
  inventoryCount: number;
  activeDemandCount: number;
}

export function HomeSetupPanel({ status }: { status: SetupStatus }) {
  const steps = [
    {
      done: status.hasInventory,
      label: "הוסף מלאי",
      href: "/inventory",
      hint: status.inventoryCount > 0 ? `${status.inventoryCount} רכבים` : "טרם נוסף מלאי",
    },
    {
      done: status.hasActiveDemand,
      label: "פתח חיפוש",
      href: "/demand?new=1",
      hint: status.activeDemandCount > 0 ? `${status.activeDemandCount} פעילים` : "טרם נפתח חיפוש",
    },
    {
      done: status.pushEnabled,
      label: "הפעל התראות",
      href: "/account#push",
      hint: status.pushEnabled ? "Push פעיל" : "מומלץ להפעיל",
    },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  return (
    <section>
      <Surface depth="raised" className={styles.setupPanel}>
        <div>
          <p className="font-medium text-v2-text-primary">הגדרה ראשונית</p>
          <p className="mt-1 text-small text-v2-text-secondary">
            {BRAND.parent} עובד הכי טוב כשיש מלאי וחיפוש פעיל
          </p>
        </div>
        <ul className={styles.setupSteps}>
          {steps.map((step) => (
            <li key={step.label}>
              <Link href={step.href} className={styles.setupStep}>
                <span
                  className={
                    step.done ? styles.setupCheckDone : styles.setupCheckPending
                  }
                  aria-hidden
                >
                  {step.done ? "✓" : "○"}
                </span>
                <span>
                  <span className="font-medium text-v2-text-primary">{step.label}</span>
                  <span className="block text-label text-v2-text-muted">{step.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <ButtonV2 variant="secondary" href="/onboarding" className="w-full">
          המשך הגדרה
        </ButtonV2>
      </Surface>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  permissionToDisplayStatus,
  pushOnboardingStorageKey,
  type PushDisplayStatus,
} from "@/lib/push-support";
import {
  getPushClientSnapshot,
  subscribeToPush,
  unsubscribeFromPush,
  type PushClientSnapshot,
} from "@/lib/push-client";
import { ButtonV2 } from "@/components/ui/brand-v2";

const STATUS_LABEL: Record<PushDisplayStatus, string> = {
  active: "פעיל",
  off: "כבוי",
  blocked: "חסום בדפדפן",
  unsupported: "לא נתמך במכשיר הזה",
  ios_needs_install: "נדרשת התקנה למסך הבית",
};

export function PushSettings({
  userId,
  compact = false,
}: {
  userId?: string;
  compact?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<PushClientSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBlockedHelp, setShowBlockedHelp] = useState(false);

  const refresh = useCallback(async () => {
    setSnapshot(await getPushClientSnapshot());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!snapshot) {
    return (
      <p className="text-sm text-v2-text-muted">בודק מצב התראות...</p>
    );
  }

  const displayStatus = permissionToDisplayStatus(
    snapshot.permission,
    snapshot.deviceSubscribed,
    snapshot.support
  );

  const canToggle =
    snapshot.support === "supported" &&
    snapshot.permission !== "denied" &&
    snapshot.pushConfigured;

  async function handleEnable() {
    setBusy(true);
    setError(null);
    const result = await subscribeToPush();
    setBusy(false);
    if (result.ok) {
      await refresh();
      return;
    }
    if (result.reason === "denied") {
      await refresh();
      return;
    }
    setError("לא הצלחנו להפעיל התראות. נסה שוב.");
    await refresh();
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    const result = await unsubscribeFromPush();
    setBusy(false);
    if (!result.ok) {
      setError("לא הצלחנו לכבות התראות. נסה שוב.");
    }
    await refresh();
  }

  async function handleSwitchChange(checked: boolean) {
    if (checked) await handleEnable();
    else await handleDisable();
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {!compact && (
            <>
              <p className="font-medium text-v2-text-primary">התראות Push</p>
              <p className="mt-0.5 text-sm text-v2-text-secondary">
                קבלת עדכונים על התאמות ופעולות חשובות
              </p>
            </>
          )}
          {compact && (
            <p className="text-sm text-v2-text-secondary">
              סטטוס התראות:{" "}
              <span className="font-medium text-v2-warm">
                {STATUS_LABEL[displayStatus]}
              </span>
            </p>
          )}
          {!compact && (
            <p className="mt-2 text-sm font-medium text-v2-warm">
              {STATUS_LABEL[displayStatus]}
            </p>
          )}
        </div>
        {canToggle && (
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={displayStatus === "active"}
              disabled={busy}
              onChange={(e) => handleSwitchChange(e.target.checked)}
              aria-label="הפעלת התראות Push"
            />
            <span className="h-7 w-12 rounded-full bg-v2-border peer-checked:bg-v2-signal peer-disabled:opacity-50 after:absolute after:right-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:transition peer-checked:after:-translate-x-5" />
          </label>
        )}
      </div>

      {displayStatus === "blocked" && (
        <div className="space-y-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-v2-text-secondary">
          <p className="font-medium text-warning">התראות חסומות בדפדפן</p>
          <p>
            כדי להפעיל התראות, יש לאפשר אותן בהגדרות הדפדפן/המכשיר.
          </p>
          <button
            type="button"
            className="text-sm font-medium text-v2-signal underline"
            onClick={() => setShowBlockedHelp((v) => !v)}
          >
            איך מפעילים?
          </button>
          {showBlockedHelp && (
            <p className="text-xs leading-relaxed">
              ב-Chrome/Android: הגדרות האתר → התראות → אפשר.
              <br />
              ב-iPhone: הגדרות → התראות → Safari/האפליקציה → אפשר התראות.
            </p>
          )}
        </div>
      )}

      {displayStatus === "ios_needs_install" && (
        <div className="rounded-lg bg-v2-surface-secondary px-3 py-2 text-sm text-v2-text-secondary">
          <p>
            ב-iPhone, התראות Push זמינות רק כש-REMATCHER מותקן למסך הבית.
            השתמש ב&quot;הוסף למסך הבית&quot; מ-Safari ואז הפעילו התראות מכאן.
          </p>
        </div>
      )}

      {displayStatus === "unsupported" && (
        <p className="text-sm text-v2-text-muted">
          הדפדפן במכשיר הזה לא תומך בהתראות Push.
        </p>
      )}

      {displayStatus === "off" &&
        snapshot.support === "supported" &&
        snapshot.permission === "granted" &&
        !snapshot.pushConfigured && (
          <p className="text-sm text-v2-text-muted">
            שירות ההתראות לא מוגדר כרגע בשרת.
          </p>
        )}

      {displayStatus === "off" &&
        snapshot.support === "supported" &&
        snapshot.permission === "default" &&
        !canToggle && (
          <ButtonV2
            variant="secondary"
            className="w-full"
            disabled={busy || !snapshot.pushConfigured}
            onClick={handleEnable}
          >
            {busy ? "מפעיל..." : "הפעל התראות"}
          </ButtonV2>
        )}

      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}

/** Compact card variant for mobile onboarding area */
export function PushOnboardingCard({
  onEnable,
  onDismiss,
  busy,
}: {
  onEnable: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  return (
    <div className="rounded-xl border border-v2-border bg-v2-surface-raised p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-v2-signal-soft text-v2-signal">
          <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h3 className="font-semibold text-v2-text-primary">
            קבלו עדכון כשיש משהו שדורש אתכם
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-v2-text-secondary">
            REMATCHER יכול להתריע על התאמות חדשות, עניין מסוחר אחר ופעולות
            שמחכות לטיפול — גם כשהאפליקציה לא פתוחה.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <ButtonV2
          variant="signal"
          className="flex-1"
          disabled={busy}
          onClick={onEnable}
        >
          {busy ? "מפעיל..." : "הפעל התראות"}
        </ButtonV2>
        <ButtonV2 variant="ghost" className="flex-1" disabled={busy} onClick={onDismiss}>
          לא עכשיו
        </ButtonV2>
      </div>
    </div>
  );
}

export function markPushOnboardingDismissed(userId: string) {
  try {
    localStorage.setItem(pushOnboardingStorageKey(userId), "1");
  } catch {
    /* private mode */
  }
}

export function isPushOnboardingDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(pushOnboardingStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

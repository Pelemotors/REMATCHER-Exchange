"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { shouldShowPushOnboarding } from "@/lib/push-support";
import {
  getPushClientSnapshot,
  isMobileViewport,
  subscribeToPush,
} from "@/lib/push-client";
import {
  PushOnboardingCard,
  isPushOnboardingDismissed,
  markPushOnboardingDismissed,
} from "@/components/pwa/push-settings";

export function PushOnboardingPrompt() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluate = useCallback(async () => {
    if (!userId) {
      setVisible(false);
      return;
    }

    const snapshot = await getPushClientSnapshot();
    const show = shouldShowPushOnboarding({
      support: snapshot.support,
      permission:
        snapshot.permission === "unsupported" ? "default" : snapshot.permission,
      deviceSubscribed: snapshot.deviceSubscribed,
      dismissed: isPushOnboardingDismissed(userId),
      isMobileViewport: isMobileViewport(),
    });
    setVisible(show);
  }, [userId]);

  useEffect(() => {
    const run = () => {
      void evaluate();
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(run, 2000);
    return () => clearTimeout(timer);
  }, [evaluate]);

  if (!visible || !userId) return null;

  async function handleEnable() {
    setBusy(true);
    setError(null);
    const result = await subscribeToPush();
    setBusy(false);
    if (result.ok) {
      setVisible(false);
      return;
    }
    if (result.reason === "denied") {
      setVisible(false);
      return;
    }
    setError("לא הצלחנו להשלים את הרישום להתראות. נסה שוב.");
    await evaluate();
  }

  function handleDismiss() {
    markPushOnboardingDismissed(userId!);
    setVisible(false);
  }

  return (
    <div className="mb-4 md:hidden">
      <PushOnboardingCard
        onEnable={handleEnable}
        onDismiss={handleDismiss}
        busy={busy}
      />
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}

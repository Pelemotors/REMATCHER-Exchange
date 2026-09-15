"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type ShareStagingPlugin = {
  getPending: () => Promise<{
    pending: boolean;
    clientBatchId?: string;
    source?: string;
    text?: string;
  }>;
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

function handoffPath(pending: {
  clientBatchId?: string;
  source?: string;
  text?: string;
}): string | null {
  if (!pending.clientBatchId) return null;
  const q = new URLSearchParams({
    clientBatchId: pending.clientBatchId,
    source: pending.source || "ANDROID_SHARE",
    staged: "1",
  });
  if (pending.text?.trim()) q.set("text", pending.text.slice(0, 1500));
  return `/intake/handoff?${q.toString()}`;
}

function pathFromAppUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === "rematcher-exchange:") {
      const host = url.host || "";
      if (host === "intake") return `/intake/handoff${url.search}`;
      if (host === "app") {
        const p = url.pathname || "/home";
        return p.startsWith("/") ? p : `/${p}`;
      }
      const p = url.pathname || "/home";
      return p.startsWith("/") ? `${p}${url.search}` : `/${p}${url.search}`;
    }
    if (url.protocol === "https:") {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Capacitor OS bridge: deep links, back, keyboard inset, pending Share resume.
 * No business logic — routes into existing Web screens/APIs.
 */
export function CapacitorNativeBridge() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform() || cancelled) return;

        document.documentElement.dataset.nativeShell = Capacitor.getPlatform();

        const resumePendingShare = async () => {
          const plugin = await getShareStaging();
          if (!plugin || cancelled) return;
          try {
            const pending = await plugin.getPending();
            if (!pending.pending) return;
            const path = handoffPath(pending);
            if (!path) return;
            const here = `${window.location.pathname}${window.location.search}`;
            if (here.startsWith("/intake/handoff")) return;
            if (here.startsWith("/login") || here.startsWith("/signup")) return;
            router.push(path);
          } catch {
            /* staging plugin may be absent on incomplete builds */
          }
        };

        try {
          const { App } = await import("@capacitor/app");

          const launch = await App.getLaunchUrl();
          if (launch?.url && !cancelled) {
            const path = pathFromAppUrl(launch.url);
            if (path) router.push(path);
          }

          const urlSub = await App.addListener("appUrlOpen", (event) => {
            const path = pathFromAppUrl(event.url);
            if (path) router.push(path);
          });
          cleanups.push(() => void urlSub.remove());

          const stateSub = await App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) void resumePendingShare();
          });
          cleanups.push(() => void stateSub.remove());

          const backSub = await App.addListener("backButton", ({ canGoBack }) => {
            const open = document.documentElement.dataset.agentOpen === "1";
            if (open) {
              document.dispatchEvent(new CustomEvent("rematcher:agent-close"));
              return;
            }
            if (canGoBack || window.history.length > 1) {
              window.history.back();
              return;
            }
            void App.exitApp();
          });
          cleanups.push(() => void backSub.remove());
        } catch {
          /* @capacitor/app */
        }

        // Keyboard / visualViewport → CSS var so composer stays above keyboard
        const applyKb = (px: number) => {
          document.documentElement.style.setProperty(
            "--kb-inset",
            `${Math.max(0, Math.round(px))}px`
          );
        };
        applyKb(0);

        try {
          const { Keyboard } = await import("@capacitor/keyboard");
          const showSub = await Keyboard.addListener("keyboardWillShow", (info) => {
            applyKb(info.keyboardHeight);
          });
          const hideSub = await Keyboard.addListener("keyboardWillHide", () => {
            applyKb(0);
          });
          cleanups.push(() => {
            void showSub.remove();
            void hideSub.remove();
          });
        } catch {
          const vv = window.visualViewport;
          if (vv) {
            const onVv = () => {
              const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
              applyKb(covered);
            };
            vv.addEventListener("resize", onVv);
            vv.addEventListener("scroll", onVv);
            cleanups.push(() => {
              vv.removeEventListener("resize", onVv);
              vv.removeEventListener("scroll", onVv);
            });
          }
        }

        // After session restore / cold start: claim staged Share
        await resumePendingShare();
        const t = window.setTimeout(() => void resumePendingShare(), 1200);
        cleanups.push(() => window.clearTimeout(t));
      } catch {
        /* browser */
      }
    })();

    return () => {
      cancelled = true;
      for (const c of cleanups) c();
    };
  }, [router]);

  return null;
}

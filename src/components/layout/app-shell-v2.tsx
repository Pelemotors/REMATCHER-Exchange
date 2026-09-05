"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User } from "lucide-react";
import { ExchangeMark } from "@/components/brand/exchange-mark";
import { NavItemV2 } from "@/components/ui/brand-v2/nav-item-v2";
import { AgentWorkspaceProvider } from "@/components/assistant/agent-workspace-provider";
import { useAgentShellFlags } from "@/components/layout/agent-shell-chrome";
import { BRAND } from "@/config/brand";
import { MOBILE_BOTTOM_NAV_ITEMS } from "@/config/mobile-nav";
import { cn } from "@/lib/utils";
import styles from "./app-shell-v2.module.css";

const ExchangeAssistant = dynamic(
  () =>
    import("@/components/assistant/exchange-assistant").then((m) => ({
      default: m.ExchangeAssistant,
    })),
  { ssr: false }
);

const PushOnboardingPrompt = dynamic(
  () =>
    import("@/components/pwa/push-onboarding-prompt").then((m) => ({
      default: m.PushOnboardingPrompt,
    })),
  { ssr: false }
);

const pageTitles: Record<string, string> = {
  "/home": "בית",
  "/inventory": "מלאי",
  "/demand": "חיפושים",
  "/matches": "התאמות",
  "/activity": "פעילות",
  "/account": "חשבון",
  "/opportunities": "הזדמנויות",
  "/validations": "אימותים",
};

function resolveTitle(pathname: string) {
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path)
  );
  return match?.[1] ?? BRAND.productShort;
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = resolveTitle(pathname);
  const { hideMobileNav, desktopAgentOpen } = useAgentShellFlags();

  return (
    <div
      data-app-shell="true"
      className={cn(
        styles.shell,
        desktopAgentOpen && styles.shellWithAgent
      )}
    >
      <aside className={styles.sidebar}>
        <Link href="/home" className={styles.brandLockup}>
          <ExchangeMark
            state="idle"
            variant="hero"
            className={styles.brandMark}
            decorative
          />
          <div className={styles.brandText}>
            <p className={styles.brandParent}>{BRAND.parent}</p>
            <p className={styles.brandProduct}>{BRAND.productShort}</p>
          </div>
        </Link>

        <nav className={styles.sidebarNav} aria-label="ניווט ראשי">
          {MOBILE_BOTTOM_NAV_ITEMS.map((item) => (
            <NavItemV2
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname.startsWith(item.href)}
            />
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <NavItemV2
            href="/account"
            label="חשבון"
            icon={User}
            active={pathname.startsWith("/account")}
          />
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.mobileHeader}>
          <span className={styles.headerSpacer} aria-hidden />
          <span className={styles.mobileTitle}>{title}</span>
          <Link
            href="/account"
            className={styles.accountButton}
            aria-label="חשבון"
          >
            <User className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        </header>

        <main className={styles.content}>{children}</main>
        <PushOnboardingPrompt />
        <ExchangeAssistant />
      </div>

      <nav
        className={cn(
          styles.mobileNav,
          hideMobileNav && styles.mobileNavHidden
        )}
        aria-label="ניווט תחתון"
        hidden={hideMobileNav}
      >
        <div className={styles.mobileNavInner}>
          {MOBILE_BOTTOM_NAV_ITEMS.map((item) => (
            <NavItemV2
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname.startsWith(item.href)}
              compact
            />
          ))}
        </div>
      </nav>
    </div>
  );
}

export function AppShellV2({ children }: { children: React.ReactNode }) {
  return (
    <AgentWorkspaceProvider>
      <AppShellInner>{children}</AppShellInner>
    </AgentWorkspaceProvider>
  );
}

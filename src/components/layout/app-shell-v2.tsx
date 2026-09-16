"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, User } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { AgentWorkspaceProvider } from "@/components/assistant/agent-workspace-provider";
import { useAgentShellFlags } from "@/components/layout/agent-shell-chrome";
import { MOBILE_BOTTOM_NAV_ITEMS, SECONDARY_NAV_ITEMS } from "@/config/mobile-nav";
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

function isActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home" || pathname === "/";
  return pathname.startsWith(href);
}

function reachedHref(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ShellLink({
  href,
  className,
  active,
  children,
}: {
  href: string;
  className?: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? "page" : undefined}
      className={cn(className, pending && !active && styles.navItemPending)}
      onClick={() => {
        if (active) return;
        setPending(true);
        window.setTimeout(() => {
          if (!reachedHref(window.location.pathname, href)) {
            window.location.assign(href);
          }
        }, 700);
      }}
    >
      {children}
    </Link>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hideMobileNav } = useAgentShellFlags();
  const intake = pathname.startsWith("/intake");

  return (
    <div data-app-shell="true" className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/home" className={styles.brandLockup} aria-label="REMATCHER Exchange">
          <BrandMark variant="gold" size={28} />
        </Link>
        <nav className={styles.sidebarNav} aria-label="ניווט ראשי">
          {MOBILE_BOTTOM_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                styles.navItem,
                isActive(pathname, item.href) && styles.navItemActive
              )}
            >
              {item.capture ? (
                <span className={styles.captureFab} style={{ marginTop: 0, width: 40, height: 40, borderRadius: 12 }}>
                  <Plus size={20} strokeWidth={2.4} />
                </span>
              ) : (
                <item.icon size={20} strokeWidth={1.75} aria-hidden />
              )}
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          {SECONDARY_NAV_ITEMS.slice(0, 3).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={cn(
                styles.navItem,
                isActive(pathname, item.href) && styles.navItemActive
              )}
            >
              <item.icon size={18} strokeWidth={1.75} aria-hidden />
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          ))}
        </div>
      </aside>

      <div className={styles.mainColumn}>
        {!intake ? (
          <header className={styles.mobileHeader}>
            <Link href="/home" className={styles.headerBrand}>
              <BrandMark variant="gold" size={22} />
              <span className={styles.brandText}>
                <span className={styles.brandName}>REMATCHER</span>
                <span className={styles.brandSub}>Exchange</span>
              </span>
            </Link>
            <Link href="/account" className={styles.accountButton} aria-label="חשבון">
              <User className="h-5 w-5" strokeWidth={1.75} />
            </Link>
          </header>
        ) : null}

        <main className={cn(styles.content, intake && styles.contentFlush)}>
          {children}
        </main>
        <PushOnboardingPrompt />
        <ExchangeAssistant />
      </div>

      <nav
        className={cn(styles.mobileNav, hideMobileNav && styles.mobileNavHidden)}
        aria-label="ניווט תחתון"
        hidden={hideMobileNav}
      >
        <div className={styles.mobileNavInner}>
          {MOBILE_BOTTOM_NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            if (item.capture) {
              return (
                <ShellLink
                  key={item.href}
                  href={item.href}
                  active={active}
                  className={cn(styles.captureSlot, active && styles.captureSlotActive)}
                >
                  <span className={styles.captureFab}>
                    <Plus size={26} strokeWidth={2.5} aria-hidden />
                  </span>
                  <span>{item.label}</span>
                </ShellLink>
              );
            }
            return (
              <ShellLink
                key={item.href}
                href={item.href}
                active={active}
                className={cn(styles.navItem, active && styles.navItemActive)}
              >
                <item.icon size={20} strokeWidth={active ? 2 : 1.7} aria-hidden />
                <span className={styles.navLabel}>{item.label}</span>
              </ShellLink>
            );
          })}
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

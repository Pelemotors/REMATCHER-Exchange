"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Package,
  Search,
  Link2,
  Bell,
  User,
  Menu,
} from "lucide-react";
import { ExchangeMark } from "@/components/brand/exchange-mark";
import { NavItemV2 } from "@/components/ui/brand-v2/nav-item-v2";
import { AgentWorkspaceProvider } from "@/components/assistant/agent-workspace-provider";
import { useAgentShellFlags } from "@/components/layout/agent-shell-chrome";
import { BRAND } from "@/config/brand";
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

const navItems = [
  { href: "/home", label: "בית", icon: Home },
  { href: "/inventory", label: "מלאי", icon: Package },
  { href: "/demand", label: "חיפושים", icon: Search },
  { href: "/matches", label: "התאמות", icon: Link2 },
  { href: "/activity", label: "פעילות", icon: Bell },
] as const;

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
  const [menuOpen, setMenuOpen] = useState(false);
  const title = resolveTitle(pathname);
  const { hideMobileNav, desktopAgentOpen } = useAgentShellFlags();

  return (
    <div
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
          {navItems.map((item) => (
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
          <button
            type="button"
            className={styles.menuButton}
            aria-label="תפריט"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <span className={styles.mobileTitle}>{title}</span>
          <Link
            href="/account"
            className={styles.accountButton}
            aria-label="חשבון"
          >
            <User className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        </header>

        <main className={styles.content}>
          <PushOnboardingPrompt />
          {children}
        </main>
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
          {navItems.map((item) => (
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

      {menuOpen && (
        <div
          className={styles.menuOverlay}
          onClick={() => setMenuOpen(false)}
          role="presentation"
        >
          <nav
            className={styles.menuPanel}
            aria-label="תפריט מובייל"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href="/home"
              className={styles.brandLockup}
              onClick={() => setMenuOpen(false)}
            >
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
            {navItems.map((item) => (
              <NavItemV2
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={pathname.startsWith(item.href)}
                onClick={() => setMenuOpen(false)}
              />
            ))}
            <div className={styles.sidebarFooter}>
              <NavItemV2
                href="/account"
                label="חשבון"
                icon={User}
                active={pathname.startsWith("/account")}
                onClick={() => setMenuOpen(false)}
              />
            </div>
          </nav>
        </div>
      )}
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

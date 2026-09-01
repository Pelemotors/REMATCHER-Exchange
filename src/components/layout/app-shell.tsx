"use client";

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
import { cn } from "@/lib/utils";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { ExchangeAssistant } from "@/components/assistant/exchange-assistant";

const navItems = [
  { href: "/home", label: "בית", icon: Home },
  { href: "/inventory", label: "מלאי", icon: Package },
  { href: "/demand", label: "חיפושים", icon: Search },
  { href: "/matches", label: "התאמות", icon: Link2 },
  { href: "/activity", label: "פעילות", icon: Bell },
];

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas pb-20 md:pb-0 md:grid md:grid-cols-[260px_1fr]">
      {/* Desktop sidebar — Midnight */}
      <aside className="sidebar-dark hidden md:flex md:flex-col md:p-6">
        <div className="mb-10">
          <BrandWordmark variant="light" />
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-body font-medium transition duration-normal",
                pathname.startsWith(href)
                  ? "sidebar-nav-active"
                  : "sidebar-nav-inactive"
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              {label}
            </Link>
          ))}
        </nav>
        <Link
          href="/account"
          className={cn(
            "mt-4 flex items-center gap-3 rounded-md px-3 py-2.5 text-body font-medium transition duration-normal",
            pathname.startsWith("/account")
              ? "sidebar-nav-active"
              : "sidebar-nav-inactive"
          )}
        >
          <User className="h-5 w-5" strokeWidth={1.75} />
          חשבון
        </Link>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90">
          <div className="container-app flex h-14 items-center justify-between md:h-16">
            <button
              className="rounded-sm p-2 hover:bg-surface-secondary md:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="תפריט"
            >
              <Menu className="h-5 w-5 text-ink" strokeWidth={1.75} />
            </button>
            <div className="md:hidden">
              <BrandWordmark variant="compact" />
            </div>
            <h1 className="hidden text-h3 font-semibold text-ink md:block">
              {title ?? "Exchange"}
            </h1>
            <Link
              href="/account"
              className="rounded-sm p-2 hover:bg-surface-secondary md:hidden"
              aria-label="חשבון"
            >
              <User className="h-5 w-5 text-text-secondary" strokeWidth={1.75} />
            </Link>
            <div className="hidden w-9 md:block" />
          </div>
        </header>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-50 bg-midnight/60 md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <nav
              className="sidebar-dark absolute right-0 top-0 h-full w-72 p-6 shadow-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <BrandWordmark variant="light" className="mb-8" />
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-3 text-body font-medium",
                    pathname.startsWith(href)
                      ? "sidebar-nav-active"
                      : "sidebar-nav-inactive"
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                  {label}
                </Link>
              ))}
              <Link
                href="/account"
                onClick={() => setSidebarOpen(false)}
                className="mt-2 flex items-center gap-3 rounded-md px-3 py-3 text-body font-medium sidebar-nav-inactive"
              >
                <User className="h-5 w-5" strokeWidth={1.75} />
                חשבון
              </Link>
            </nav>
          </div>
        )}

        <main className="container-app flex-1 py-4 md:py-8">{children}</main>
        <ExchangeAssistant />
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface md:hidden">
        <div className="flex justify-around pb-[env(safe-area-inset-bottom)]">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-label font-medium transition duration-normal",
                pathname.startsWith(href)
                  ? "text-signal"
                  : "text-text-muted"
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

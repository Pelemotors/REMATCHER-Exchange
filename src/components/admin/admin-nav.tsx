"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeV2 } from "@/components/ui/brand-v2";
import styles from "@/app/admin/admin-layout.module.css";

export const ADMIN_NAV = [
  { href: "/admin", label: "סקירה" },
  { href: "/admin/attention", label: "דורש טיפול" },
  { href: "/admin/search", label: "חיפוש" },
  { href: "/admin/dealers", label: "סוחרים" },
  { href: "/admin/users", label: "משתמשים" },
  { href: "/admin/customers", label: "לקוחות" },
  { href: "/admin/demands", label: "חיפושים" },
  { href: "/admin/vehicles", label: "רכבים" },
  { href: "/admin/catalogs", label: "קטלוגים" },
  { href: "/admin/matches", label: "התאמות" },
  { href: "/admin/intakes", label: "Intake" },
  { href: "/admin/opportunities", label: "הזדמנויות" },
  { href: "/admin/interest", label: "Interest / Reveal" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/system", label: "מערכת" },
] as const;

export function AdminNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname() || "/admin";

  return (
    <nav className={styles.nav} aria-label="ניווט מנהל מערכת">
      <Link href="/admin" className={styles.navBrand}>
        System Administration
      </Link>
      {ADMIN_NAV.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
          >
            {item.label}
            {item.href === "/admin/dealers" && pendingCount > 0 && (
              <BadgeV2 variant="signal" className="mr-2">
                {pendingCount}
              </BadgeV2>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

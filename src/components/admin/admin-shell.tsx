import Link from "next/link";
import { BadgeV2 } from "@/components/ui/brand-v2";
import { AdminLogoutButton } from "@/components/admin/admin-logout-button";
import styles from "@/app/admin/admin-layout.module.css";

const ADMIN_NAV = [
  { href: "/admin", label: "סקירה" },
  { href: "/admin/attention", label: "דורש טיפול" },
  { href: "/admin/dealers", label: "סוחרים" },
  { href: "/admin/users", label: "משתמשים" },
  { href: "/admin/catalogs", label: "קטלוגים" },
  { href: "/admin/system", label: "מערכת" },
] as const;

export function AdminShell({
  email,
  pendingCount,
  children,
}: {
  email: string;
  pendingCount: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <nav className={styles.nav}>
            <Link href="/admin" className={styles.navBrand}>
              REMATCHER Exchange — System Administration
            </Link>
            {ADMIN_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
                {item.href === "/admin/dealers" && pendingCount > 0 && (
                  <BadgeV2 variant="signal" className="mr-2">
                    {pendingCount}
                  </BadgeV2>
                )}
              </Link>
            ))}
            <div className={styles.navSpacer} />
            <span className={styles.navMeta}>{email}</span>
            <AdminLogoutButton />
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}

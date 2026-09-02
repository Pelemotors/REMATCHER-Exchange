import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/brand-copy";
import { redirect } from "next/navigation";
import { BadgeV2 } from "@/components/ui/brand-v2";
import { countPendingDealersForApproval } from "@/services/admin/dealer-verification";
import styles from "./admin-layout.module.css";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id || !isAdminRole(session.user.role)) {
    redirect("/login?callbackUrl=/admin");
  }

  const pendingCount = await countPendingDealersForApproval();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <nav className={styles.nav}>
            <Link href="/admin" className={styles.navBrand}>
              Control Room
            </Link>
            <Link href="/admin/dealers" className={styles.navLink}>
              סוחרים לאישור
              {pendingCount > 0 && (
                <BadgeV2 variant="signal" className="mr-2">
                  {pendingCount}
                </BadgeV2>
              )}
            </Link>
            <Link href="/admin/communications" className={styles.navLink}>
              תקשורת Push
            </Link>
            <Link href="/admin/intelligence" className={styles.navLink}>
              Product Intelligence
            </Link>
            <Link href="/home" className={styles.navLink}>
              Exchange
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

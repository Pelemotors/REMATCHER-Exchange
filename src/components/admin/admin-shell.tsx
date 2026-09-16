import { AdminLogoutButton } from "@/components/admin/admin-logout-button";
import { AdminSearchForm } from "@/components/admin/admin-search-form";
import { AdminNav } from "@/components/admin/admin-nav";
import styles from "@/app/admin/admin-layout.module.css";

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
          <div className={styles.headerRow}>
            <AdminNav pendingCount={pendingCount} />
            <div className={styles.headerMeta}>
              <span className={styles.navMeta}>{email}</span>
              <AdminLogoutButton />
            </div>
          </div>
          <AdminSearchForm />
        </div>
      </header>
      {children}
    </>
  );
}

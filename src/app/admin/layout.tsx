import { adminAuth } from "@/lib/admin-auth";
import { isAdminRole } from "@/lib/brand-copy";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { countPendingDealersForApproval } from "@/services/admin/dealer-verification";
import styles from "./admin-layout.module.css";

/**
 * Root admin layout: unauthenticated visitors see Admin Login only (never /login).
 * Authenticated admins get the System Administration shell.
 * Nested routes still render as children only when session is valid.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await adminAuth();
  if (!session?.user?.id || !isAdminRole(session.user.role)) {
    return (
      <div className={styles.root}>
        <AdminLoginForm />
      </div>
    );
  }

  const pendingCount = await countPendingDealersForApproval();

  return (
    <div className={styles.root}>
      <AdminShell email={session.user.email} pendingCount={pendingCount}>
        {children}
      </AdminShell>
    </div>
  );
}

import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/brand-copy";
import { redirect } from "next/navigation";
import { countPendingDealersForApproval } from "@/services/admin/dealer-verification";

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
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="container-app flex items-center justify-between py-4">
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="font-semibold">
              Control Room
            </Link>
            <Link href="/admin/dealers" className="text-text-secondary hover:text-ink">
              סוחרים לאישור
              {pendingCount > 0 && (
                <span className="mr-2 rounded-full bg-signal px-2 py-0.5 text-xs text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
            <Link href="/home" className="text-text-secondary hover:text-ink">
              Exchange
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

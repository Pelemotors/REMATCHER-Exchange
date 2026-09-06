import Link from "next/link";
import { Surface } from "@/components/ui/brand-v2";
import { AdminCreateDealer } from "@/components/admin/admin-create-dealer";
import { countPendingDealersForApproval, getPendingDealers } from "@/services/admin/dealer-verification";

export default async function AdminDealersPage() {
  const [count, dealers] = await Promise.all([
    countPendingDealersForApproval(),
    getPendingDealers(),
  ]);

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-v2-warm">ניהול סוחרים</h1>
          <p className="text-sm text-v2-text-secondary">{count} בקשות פתוחות</p>
        </div>
        <div className="flex items-center gap-3">
          <AdminCreateDealer />
          <Link href="/admin" className="text-sm text-v2-signal">Control Room</Link>
        </div>
      </div>

      <h2 className="mb-3 font-semibold text-v2-text-primary">ממתינים לאישור</h2>
      {dealers.length === 0 ? (
        <Surface depth="raised" className="p-6 text-center text-v2-text-secondary">
          אין סוחרים שממתינים לאישור
        </Surface>
      ) : (
        <div className="space-y-3">
          {dealers.map((d) => {
            const owner = d.memberships[0]?.user;
            return (
              <Link key={d.id} href={`/admin/dealers/${d.id}`} className="block">
                <Surface depth="raised" className="p-4 transition-opacity hover:opacity-95">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-v2-text-primary">{d.businessName}</p>
                      <p className="text-sm text-v2-text-secondary">
                        {d.contactName}{d.city ? ` · ${d.city}` : ""}
                      </p>
                      <p className={`mt-1 text-xs ${owner?.emailVerifiedAt ? "text-v2-text-muted" : "text-amber-400"}`}>
                        {owner?.email ?? "אין מייל בעלים"} · {owner?.emailVerifiedAt ? "מייל מאומת" : "מייל לא אומת"}
                      </p>
                    </div>
                    <span className="text-xs text-v2-text-muted">
                      {new Date(d.createdAt).toLocaleDateString("he-IL")}
                    </span>
                  </div>
                </Surface>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

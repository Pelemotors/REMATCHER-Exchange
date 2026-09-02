import Link from "next/link";
import { Surface } from "@/components/ui/brand-v2";
import { countPendingDealersForApproval, getPendingDealers } from "@/services/admin/dealer-verification";

export default async function AdminDealersPage() {
  const [count, dealers] = await Promise.all([
    countPendingDealersForApproval(),
    getPendingDealers(),
  ]);

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v2-warm">סוחרים שממתינים לאישור</h1>
          <p className="text-sm text-v2-text-secondary">{count} בקשות פתוחות</p>
        </div>
        <Link href="/admin" className="text-sm text-v2-signal">
          Control Room
        </Link>
      </div>

      {dealers.length === 0 ? (
        <Surface depth="raised" className="p-6 text-center text-v2-text-secondary">
          אין סוחרים שממתינים לאישור
        </Surface>
      ) : (
        <div className="space-y-3">
          {dealers.map((d) => (
            <Link key={d.id} href={`/admin/dealers/${d.id}`} className="block">
              <Surface depth="raised" className="p-4 transition-opacity hover:opacity-95">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-v2-text-primary">{d.businessName}</p>
                    <p className="text-sm text-v2-text-secondary">
                      {d.contactName} · {d.city}
                    </p>
                  </div>
                  <span className="text-xs text-v2-text-muted">
                    {new Date(d.createdAt).toLocaleDateString("he-IL")}
                  </span>
                </div>
              </Surface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

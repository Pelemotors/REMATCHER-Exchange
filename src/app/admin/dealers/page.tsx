import Link from "next/link";
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
          <h1 className="text-2xl font-bold">סוחרים שממתינים לאישור</h1>
          <p className="text-sm text-text-secondary">{count} בקשות פתוחות</p>
        </div>
        <Link href="/admin" className="text-sm text-signal">
          Control Room
        </Link>
      </div>

      {dealers.length === 0 ? (
        <div className="card text-center text-text-secondary">
          אין סוחרים שממתינים לאישור
        </div>
      ) : (
        <div className="space-y-3">
          {dealers.map((d) => (
            <Link
              key={d.id}
              href={`/admin/dealers/${d.id}`}
              className="card block hover:shadow-elevated"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{d.businessName}</p>
                  <p className="text-sm text-text-secondary">
                    {d.contactName} · {d.city}
                  </p>
                </div>
                <span className="text-xs text-text-muted">
                  {new Date(d.createdAt).toLocaleDateString("he-IL")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

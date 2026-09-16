import Link from "next/link";
import { Surface } from "@/components/ui/brand-v2";
import { getAdminAttentionItems } from "@/services/admin/control-center";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminAttentionPage() {
  if (!(await requireAdminPageSession())) return null;
  const attention = await getAdminAttentionItems();

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">דורש טיפול</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        פריטים שדורשים התערבות מנהל מערכת
      </p>

      {attention.length === 0 ? (
        <Surface depth="raised" className="p-6 text-center text-v2-text-secondary">
          אין פריטים דחופים כרגע
        </Surface>
      ) : (
        <div className="space-y-2">
          {attention.map((item) => (
            <Surface
              key={item.type}
              depth="raised"
              className={`flex items-center justify-between p-4 ${
                item.severity === "high" ? "border border-v2-signal/30" : ""
              }`}
            >
              <div>
                <p className="font-medium text-v2-text-primary">{item.label}</p>
                <p className="mt-1 text-xs text-v2-text-muted">
                  חומרה: {item.severity}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-v2-surface-secondary px-3 py-1 text-sm font-bold text-v2-warm">
                  {item.count}
                </span>
                {item.href && (
                  <Link href={item.href} className="text-sm text-v2-signal">
                    פתח
                  </Link>
                )}
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}

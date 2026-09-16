import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminAuditPage() {
  if (!(await requireAdminPageSession())) return null;
  const rows = await prisma.appEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      eventType: true,
      entityType: true,
      entityId: true,
      dealerId: true,
      userId: true,
      source: true,
      createdAt: true,
    },
  });

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">Audit</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        אירועי מערכת אחרונים — בלי טוקנים ומפתחות
      </p>
      <div className="space-y-2">
        {rows.length === 0 && (
          <Surface depth="raised" className="p-6 text-sm text-v2-text-muted">
            אין אירועים
          </Surface>
        )}
        {rows.map((e) => (
          <Surface key={e.id} depth="raised" className="p-3 text-sm">
            <p className="font-medium text-v2-text-primary">{e.eventType}</p>
            <p className="text-xs text-v2-text-muted">
              {e.createdAt.toLocaleString("he-IL")}
              {e.entityType ? ` · ${e.entityType}` : ""}
              {e.source ? ` · ${e.source}` : ""}
            </p>
          </Surface>
        ))}
      </div>
    </div>
  );
}

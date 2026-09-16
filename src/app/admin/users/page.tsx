import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminUsersPage() {
  if (!(await requireAdminPageSession())) return null;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      accountStatus: true,
      emailVerifiedAt: true,
      createdAt: true,
      memberships: {
        take: 1,
        select: {
          role: true,
          dealer: { select: { businessName: true } },
        },
      },
    },
  });

  const [total, admins, dealers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { role: "DEALER_USER" } }),
  ]);

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">משתמשים</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        {total} משתמשים · {admins} מנהלי מערכת · {dealers} סוחרים
      </p>

      <div className="space-y-2">
        {users.map((u) => {
          const membership = u.memberships[0];
          return (
            <Surface
              key={u.id}
              depth="raised"
              className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
            >
              <div>
                <p className="font-medium text-v2-text-primary">{u.name}</p>
                <p className="text-v2-text-secondary" dir="ltr">
                  {u.email}
                </p>
                <p className="mt-1 text-xs text-v2-text-muted">
                  {u.role}
                  {membership
                    ? ` · ${membership.role} @ ${membership.dealer.businessName}`
                    : " · ללא חברות בסוכנות"}
                  {" · "}
                  {u.accountStatus}
                  {u.emailVerifiedAt ? " · מייל מאומת" : " · מייל לא מאומת"}
                </p>
              </div>
              <span className="text-xs text-v2-text-muted">
                {u.createdAt.toLocaleDateString("he-IL")}
              </span>
            </Surface>
          );
        })}
      </div>
    </div>
  );
}

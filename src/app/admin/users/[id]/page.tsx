import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";
import { AdminUserActions } from "@/components/admin/admin-user-actions";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await requireAdminPageSession())) return null;
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      accountStatus: true,
      emailVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
      memberships: {
        select: {
          role: true,
          dealer: { select: { id: true, businessName: true } },
        },
      },
      externalIdentities: {
        select: { provider: true, verifiedEmail: true, lastUsedAt: true },
      },
    },
  });
  if (!user) notFound();

  return (
    <div className="container-app py-8">
      <Link href="/admin/users" className="text-sm text-v2-signal">
        ← משתמשים
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-v2-warm">{user.name}</h1>
      <p className="mt-1 text-sm text-v2-text-secondary" dir="ltr">
        {user.email}
      </p>

      <Surface depth="raised" className="mt-6 p-4 text-sm">
        <p>תפקיד פלטפורמה: {user.role}</p>
        <p>סטטוס: {user.accountStatus}</p>
        <p>אימות מייל: {user.emailVerifiedAt ? "כן" : "לא"}</p>
        <p>נוצר: {user.createdAt.toLocaleString("he-IL")}</p>
        <p>פעילות אחרונה: {user.updatedAt.toLocaleString("he-IL")}</p>
        <p>
          חברויות:{" "}
          {user.memberships.length === 0
            ? "אין (לא סוחר)"
            : user.memberships
                .map((m) => `${m.role} @ ${m.dealer.businessName}`)
                .join(" · ")}
        </p>
        <p>
          Providers:{" "}
          {user.externalIdentities.length
            ? user.externalIdentities.map((i) => i.provider).join(", ")
            : "אין"}
        </p>
        {user.role !== "ADMIN" && (
          <AdminUserActions
            userId={user.id}
            verified={Boolean(user.emailVerifiedAt)}
            status={user.accountStatus}
          />
        )}
      </Surface>

      {user.memberships[0] && (
        <Link
          href={`/admin/dealers/${user.memberships[0].dealer.id}`}
          className="mt-4 inline-block text-sm text-v2-signal"
        >
          פתח כרטיס סוחר
        </Link>
      )}
    </div>
  );
}

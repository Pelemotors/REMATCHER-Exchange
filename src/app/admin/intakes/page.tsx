import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminIntakesPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  if (!(await requireAdminPageSession())) return null;
  const { focus } = await searchParams;
  const rows = await prisma.intakeBatch.findMany({
    orderBy: { receivedAt: "desc" },
    take: 80,
    select: {
      id: true,
      status: true,
      source: true,
      failureCode: true,
      failureMessage: true,
      receivedAt: true,
      dealer: { select: { id: true, businessName: true } },
      _count: { select: { candidates: true, media: true } },
    },
  });

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">Intake / Capture</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        קליטה, כשלים ומועמדים — בלי חומר גלם פרטי מיותר
      </p>
      <div className="space-y-2">
        {rows.length === 0 && (
          <Surface depth="raised" className="p-6 text-sm text-v2-text-muted">
            אין אצוות קליטה
          </Surface>
        )}
        {rows.map((b) => (
          <Surface
            key={b.id}
            id={b.id}
            depth="raised"
            className={`p-4 text-sm ${focus === b.id ? "ring-1 ring-[#D4AF3B]" : ""}`}
          >
            <p className="font-medium text-v2-text-primary">
              {b.status} · {b.source}
            </p>
            <p className="mt-1 text-v2-text-secondary">
              <Link href={`/admin/dealers/${b.dealer.id}`} className="text-v2-signal">
                {b.dealer.businessName}
              </Link>
              {" · "}
              {b._count.media} מדיה · {b._count.candidates} מועמדים ·{" "}
              {b.receivedAt.toLocaleString("he-IL")}
            </p>
            {b.failureCode && (
              <p className="mt-1 text-xs text-red-300">
                {b.failureCode}
                {b.failureMessage ? ` — ${b.failureMessage}` : ""}
              </p>
            )}
          </Surface>
        ))}
      </div>
    </div>
  );
}

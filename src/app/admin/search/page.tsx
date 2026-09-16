import Link from "next/link";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";
import { ADMIN_SEARCH_TYPE_LABEL } from "@/services/admin/search-types";
import { searchAdminEntities } from "@/services/admin/search";
import { AdminSearchForm } from "@/components/admin/admin-search-form";

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!(await requireAdminPageSession())) return null;
  const { q = "" } = await searchParams;
  const results = q.trim().length >= 2 ? await searchAdminEntities(q) : [];

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">חיפוש מערכת</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        משתמש, סוחר, לקוח, רכב, חיפוש, Intake, קטלוג
      </p>
      <AdminSearchForm initial={q} />
      <div className="mt-6 space-y-2">
        {q.trim().length >= 2 && results.length === 0 && (
          <Surface depth="raised" className="p-6 text-sm text-v2-text-muted">
            אין תוצאות ל־«{q}»
          </Surface>
        )}
        {results.map((r) => (
          <Link key={`${r.type}-${r.id}`} href={r.href}>
            <Surface depth="raised" className="p-4 transition hover:opacity-95">
              <p className="text-xs font-semibold tracking-wide text-[#d4af3b]">
                {ADMIN_SEARCH_TYPE_LABEL[r.type]}
              </p>
              <p className="mt-1 font-medium text-v2-text-primary">{r.title}</p>
              <p className="text-sm text-v2-text-secondary" dir="auto">
                {r.subtitle}
              </p>
            </Surface>
          </Link>
        ))}
      </div>
    </div>
  );
}

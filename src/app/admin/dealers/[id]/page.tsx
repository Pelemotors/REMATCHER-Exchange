import { DealerReviewPanel } from "@/components/admin/dealer-review-panel";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminDealerReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await requireAdminPageSession())) return null;
  const { id } = await params;
  return (
    <div className="container-app py-8">
      <DealerReviewPanel dealerId={id} />
    </div>
  );
}

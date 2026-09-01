import { DealerReviewPanel } from "@/components/admin/dealer-review-panel";

export default async function AdminDealerReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="container-app py-8">
      <DealerReviewPanel dealerId={id} />
    </div>
  );
}

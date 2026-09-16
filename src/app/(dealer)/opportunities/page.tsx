import { Suspense } from "react";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import { DealerOpportunitiesClient } from "@/components/opportunities/dealer-opportunities-client";

export default async function OpportunitiesPage() {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) redirect("/login");

  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-v2-text-muted" role="status">
          טוען…
        </p>
      }
    >
      {/* focusId consumed inside DealerOpportunitiesClient via useSearchParams */}
      <DealerOpportunitiesClient />
    </Suspense>
  );
}

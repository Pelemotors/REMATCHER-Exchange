import { Suspense } from "react";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import { IntakeReviewClient } from "@/components/intake/intake-review-client";

export default async function IntakeReviewPage() {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    redirect("/login");
  }

  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-v2-text-muted" role="status">
          טוען…
        </p>
      }
    >
      <IntakeReviewClient />
    </Suspense>
  );
}

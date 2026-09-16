import { Suspense } from "react";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import { CatalogSettingsClient } from "@/components/catalog/catalog-settings-client";

export default async function CatalogSettingsPage() {
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
      <CatalogSettingsClient />
    </Suspense>
  );
}

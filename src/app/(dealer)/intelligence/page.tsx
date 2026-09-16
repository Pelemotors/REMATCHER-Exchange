import { Suspense } from "react";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import { NetworkIntelClient } from "@/components/intelligence/network-intel-client";

export default async function NetworkIntelPage() {
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
      <NetworkIntelClient />
    </Suspense>
  );
}

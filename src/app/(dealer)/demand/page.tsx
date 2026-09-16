import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { DemandPageClient } from "@/components/demand/demand-page-client";
import { ActionCardLoadingSkeleton } from "@/components/ui/brand-v2";
import { getEnrichedDemandsForDealer } from "@/services/demand/demand-queries";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function DemandContent({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const dealerId = session!.user!.dealerId!;
  const params = await searchParams;
  const showNew = (Array.isArray(params.new) ? params.new[0] : params.new) === "1";
  const editId = Array.isArray(params.edit) ? params.edit[0] : params.edit;
  const openId = Array.isArray(params.id) ? params.id[0] : params.id;

  const demands = await getEnrichedDemandsForDealer(dealerId, {
    includeHistory: true,
  });
  const active = demands.filter((d) =>
    ["ACTIVE", "EXPIRING", "PENDING_CONFIRMATION", "PAUSED"].includes(d.uxStatus)
  );
  const ended = demands.filter((d) => ["EXPIRED", "CLOSED"].includes(d.uxStatus));

  return (
    <DemandPageClient
      initialActive={active}
      initialEnded={ended}
      initialMode={showNew ? "create" : editId ? "edit" : "list"}
      initialOpenId={openId ?? null}
    />
  );
}

export default function DemandPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ActionCardLoadingSkeleton />}>
      <DemandContent searchParams={searchParams} />
    </Suspense>
  );
}

import { auth } from "@/lib/auth";
import { DemandPageClient } from "@/components/demand/demand-page-client";
import { getEnrichedDemandsForDealer } from "@/services/demand/demand-queries";

export default async function DemandPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const dealerId = session!.user!.dealerId!;
  const params = await searchParams;
  const showNew = (Array.isArray(params.new) ? params.new[0] : params.new) === "1";
  const editId = Array.isArray(params.edit) ? params.edit[0] : params.edit;
  const filter = Array.isArray(params.filter) ? params.filter[0] : params.filter;

  const demands = await getEnrichedDemandsForDealer(dealerId, {
    includeHistory: true,
  });
  const active = demands.filter((d) =>
    ["ACTIVE", "EXPIRING", "PENDING_CONFIRMATION"].includes(d.uxStatus)
  );
  const ended = demands.filter((d) => ["EXPIRED", "CLOSED"].includes(d.uxStatus));

  return (
    <DemandPageClient
      initialActive={active}
      initialEnded={ended}
      initialMode={showNew ? "create" : editId ? "edit" : "list"}
      initialAttentionOnly={filter === "attention"}
    />
  );
}

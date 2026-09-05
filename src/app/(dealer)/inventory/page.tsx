import { auth } from "@/lib/auth";
import {
  InventoryPageClient,
  type InventoryFilterId,
} from "@/components/inventory/inventory-page-client";
import { InventoryEnrichmentPanel } from "@/components/inventory/inventory-enrichment-panel";
import { getInventoryList } from "@/services/inventory/list-inventory";

const FILTERS: InventoryFilterId[] = [
  "all",
  "attention",
  "interest",
  "active",
  "sold",
  "missing_price",
];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const dealerId = session!.user!.dealerId!;
  const params = await searchParams;
  const requestedFilter = Array.isArray(params.filter)
    ? params.filter[0]
    : params.filter;
  const initialFilter: InventoryFilterId = FILTERS.includes(
    requestedFilter as InventoryFilterId
  )
    ? (requestedFilter as InventoryFilterId)
    : "active";

  const initialData = await getInventoryList({
    dealerId,
    page: 1,
    pageSize: 50,
    filter: initialFilter,
  });

  const focus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const enrich = Array.isArray(params.enrich) ? params.enrich[0] : params.enrich;
  const enrichmentVehicle =
    enrich === "1" && focus
      ? initialData.vehicles.find((vehicle) => vehicle.id === focus) ?? null
      : null;

  return (
    <>
      {enrichmentVehicle && <InventoryEnrichmentPanel vehicle={enrichmentVehicle} />}
      <InventoryPageClient
        initialData={initialData}
        initialFilter={initialFilter}
      />
    </>
  );
}

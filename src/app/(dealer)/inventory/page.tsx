import { Suspense } from "react";
import {
  InventoryPageClient,
  type InventoryFilterId,
} from "@/components/inventory/inventory-page-client";
import { ListLoadingSkeleton } from "@/components/ui/brand-v2";

const FILTERS: InventoryFilterId[] = [
  "all",
  "attention",
  "interest",
  "active",
  "sold",
  "missing_price",
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function InventoryContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestedFilter = Array.isArray(params.filter)
    ? params.filter[0]
    : params.filter;
  const initialFilter: InventoryFilterId = FILTERS.includes(
    requestedFilter as InventoryFilterId
  )
    ? (requestedFilter as InventoryFilterId)
    : "active";

  return (
    <InventoryPageClient
      initialData={null}
      initialFilter={initialFilter}
    />
  );
}

export default function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ListLoadingSkeleton />}>
      <InventoryContent searchParams={searchParams} />
    </Suspense>
  );
}

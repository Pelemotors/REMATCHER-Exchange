import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { MatchesPageClient } from "@/components/matches/matches-page-client";
import { ActionCardLoadingSkeleton } from "@/components/ui/brand-v2";
import { listBuyerMatches } from "@/services/matching/list-buyer-matches";

const TABS = ["action", "waiting", "history"] as const;
type TabId = (typeof TABS)[number];
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function MatchesContent({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const dealerId = session!.user!.dealerId!;
  const params = await searchParams;
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const focusId = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const initialTab: TabId = TABS.includes(requestedTab as TabId)
    ? (requestedTab as TabId)
    : "action";

  const initialMatches = await listBuyerMatches(dealerId);

  return (
    <MatchesPageClient
      initialMatches={initialMatches}
      initialTab={initialTab}
      initialFocusId={focusId ?? null}
    />
  );
}

export default function MatchesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ActionCardLoadingSkeleton />}>
      <MatchesContent searchParams={searchParams} />
    </Suspense>
  );
}

import { auth } from "@/lib/auth";
import { MatchesPageClient } from "@/components/matches/matches-page-client";
import { listBuyerMatches } from "@/services/matching/list-buyer-matches";

const TABS = ["action", "waiting", "history"] as const;
type TabId = (typeof TABS)[number];

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

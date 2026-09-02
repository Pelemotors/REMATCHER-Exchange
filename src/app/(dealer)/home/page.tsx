import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { HomeV2 } from "@/components/home/home-v2";
import { getWorkCenterSnapshot } from "@/services/dealer/work-center";

export default async function HomePage() {
  const session = await auth();
  const dealerId = session!.user!.dealerId!;
  const userId = session!.user!.id;

  const snapshot = await getWorkCenterSnapshot(dealerId, userId);

  if (snapshot.setupStatus.shouldShowOnboarding) {
    redirect("/onboarding");
  }

  return (
    <HomeV2
      userName={session!.user!.name ?? ""}
      dealerName={session!.user!.dealerName ?? null}
      actionItems={snapshot.actionItems}
      activeDemands={snapshot.activeDemands}
      inventoryCount={snapshot.inventoryCount}
      matches={snapshot.matches}
      opportunities={snapshot.opportunities}
      pendingOutcomes={snapshot.pendingOutcomes}
      connectionsLabel={snapshot.connectionsLabel}
      connectionsSecondary={snapshot.connectionsSecondary}
      notifications={snapshot.notifications}
      setupStatus={snapshot.setupStatus}
    />
  );
}

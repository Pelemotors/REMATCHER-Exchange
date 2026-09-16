import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { HomeV2 } from "@/components/home/home-v2";
import { ActionCardLoadingSkeleton } from "@/components/ui/brand-v2";
import { getWorkCenterSnapshot } from "@/services/dealer/work-center";

async function HomeContent() {
  const session = await auth();
  if (!session?.user?.id || !session.user.dealerId) {
    redirect("/login");
  }
  const dealerId = session.user.dealerId;
  const userId = session.user.id;

  const snapshot = await getWorkCenterSnapshot(dealerId, userId);

  if (snapshot.setupStatus.shouldShowOnboarding) {
    redirect("/onboarding");
  }

  const blockers = snapshot.actionItems.filter(
    (item) =>
      item.urgent ||
      item.href.startsWith("/account") ||
      item.href.startsWith("/validations") ||
      item.href.startsWith("/activity")
  );

  return (
    <HomeV2
      dealerName={session.user.dealerName ?? null}
      userName={session.user.name ?? null}
      blockers={blockers}
      setupStatus={snapshot.setupStatus}
      attention={{
        opportunities: snapshot.opportunities,
        matches: snapshot.matches,
        validations: blockers
          .filter((b) => b.href.startsWith("/validations"))
          .reduce((n, b) => n + b.count, 0),
      }}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<ActionCardLoadingSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

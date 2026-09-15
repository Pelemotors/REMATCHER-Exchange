import { Suspense } from "react";
import { IntakeHandoffClient } from "@/components/intake/intake-handoff-client";
import { ActionCardLoadingSkeleton } from "@/components/ui/brand-v2";

export default function IntakeHandoffPage() {
  return (
    <Suspense fallback={<ActionCardLoadingSkeleton />}>
      <IntakeHandoffClient />
    </Suspense>
  );
}

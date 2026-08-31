"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { PageHeader, UsageProgress } from "@/components/ui/common";
import { PushSubscribeButton } from "@/components/pwa/push-subscribe";
import { COPY } from "@/config/brand";
import type { DealerUsageSummary } from "@/config/commercial";

export default function AccountPage() {
  const { data: session } = useSession();
  const [usage, setUsage] = useState<DealerUsageSummary | null>(null);

  useEffect(() => {
    fetch("/api/commercial/usage")
      .then((r) => r.json())
      .then(setUsage);
  }, []);

  return (
    <div>
      <PageHeader title="חשבון" />

      <div className="card mb-4 space-y-3">
        <div>
          <p className="text-sm text-text-secondary">שם</p>
          <p className="font-medium">{session?.user?.name}</p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">אימייל</p>
          <p className="font-medium" dir="ltr">
            {session?.user?.email}
          </p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">סוחר</p>
          <p className="font-medium">{session?.user?.dealerName}</p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">סטטוס אימות</p>
          <span className="badge-signal">
            {session?.user?.verificationStatus ?? "PENDING"}
          </span>
        </div>
      </div>

      {usage && (
        <div className="card mb-4 space-y-4">
          <h3 className="text-h3 font-semibold text-ink">חיבורים</h3>
          {usage.actionRequired && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
              {COPY.commercialActionRequired}
            </p>
          )}
          {usage.planSlug === "onboarding" ? (
            <>
              <p className="text-body text-text-secondary">
                5 החיבורים הראשונים עלינו
              </p>
              <UsageProgress
                used={usage.freeUsed}
                total={usage.freeAllowance}
                label={COPY.connectionsRemaining(
                  usage.freeUsed,
                  usage.freeAllowance
                )}
              />
            </>
          ) : (
            <UsageProgress
              used={usage.monthlyUsed}
              total={usage.monthlyAllowance}
              label={`${usage.monthlyUsed} מתוך ${usage.monthlyAllowance} חיבורים החודש`}
            />
          )}
          <p className="text-label text-text-muted">מסלול: {usage.planName}</p>
        </div>
      )}

      <div className="card mb-4">
        <h3 className="mb-3 font-semibold">התראות</h3>
        <PushSubscribeButton />
      </div>

      <button
        className="btn-secondary w-full"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        התנתק
      </button>
    </div>
  );
}

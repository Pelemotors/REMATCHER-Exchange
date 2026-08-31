"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { PageHeader, UsageProgress } from "@/components/ui/common";
import { PushSubscribeButton } from "@/components/pwa/push-subscribe";
import { COPY } from "@/config/brand";
import {
  connectionsMonthlyUsedLabel,
  connectionsRemainingSecondary,
  connectionsUsedLabel,
  verificationLabel,
} from "@/lib/brand-copy";
import type { DealerUsageSummary } from "@/config/commercial";

export default function AccountPage() {
  const { data: session } = useSession();
  const [usage, setUsage] = useState<DealerUsageSummary | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string>(
    session?.user?.verificationStatus ?? "PENDING"
  );

  useEffect(() => {
    fetch("/api/commercial/usage")
      .then((r) => r.json())
      .then(setUsage);
    fetch("/api/account/context")
      .then((r) => (r.ok ? r.json() : null))
      .then((ctx) => {
        if (ctx?.verificationStatus) {
          setVerificationStatus(ctx.verificationStatus);
        }
      });
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
            {verificationLabel(verificationStatus)}
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
            <UsageProgress
              used={usage.freeUsed}
              total={usage.freeAllowance}
              primaryLabel={connectionsUsedLabel(
                usage.freeUsed,
                usage.freeAllowance
              )}
              secondaryLabel={connectionsRemainingSecondary(
                usage.freeUsed,
                usage.freeAllowance,
                true
              )}
            />
          ) : (
            <UsageProgress
              used={usage.monthlyUsed}
              total={usage.monthlyAllowance}
              primaryLabel={connectionsMonthlyUsedLabel(
                usage.monthlyUsed,
                usage.monthlyAllowance
              )}
              secondaryLabel={connectionsRemainingSecondary(
                usage.monthlyUsed,
                usage.monthlyAllowance,
                false
              )}
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

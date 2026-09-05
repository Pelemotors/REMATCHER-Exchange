"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { UsageProgress } from "@/components/ui/common";
import {
  BadgeV2,
  ButtonV2,
  PageHeaderV2,
  Surface,
} from "@/components/ui/brand-v2";
import { PushSettings } from "@/components/pwa/push-settings";
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
  const [profile, setProfile] = useState({
    city: "",
    region: "",
    phone: "",
    businessId: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

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
        if (ctx) {
          setProfile({
            city: ctx.city ?? "",
            region: ctx.region ?? "",
            phone: ctx.phone ?? "",
            businessId: ctx.businessId ?? "",
          });
        }
      });
  }, []);

  async function saveProfile() {
    setProfileSaving(true);
    setProfileMsg(null);
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setProfileSaving(false);
    setProfileMsg(res.ok ? "נשמר" : "שגיאה בשמירה");
  }

  return (
    <div>
      <PageHeaderV2 title="חשבון" />

      <Surface depth="raised" className="mb-4 space-y-3 p-4">
        <div>
          <p className="text-sm text-v2-text-secondary">שם</p>
          <p className="font-medium text-v2-text-primary">{session?.user?.name}</p>
        </div>
        <div>
          <p className="text-sm text-v2-text-secondary">אימייל</p>
          <p className="font-medium text-v2-text-primary" dir="ltr">
            {session?.user?.email}
          </p>
        </div>
        <div>
          <p className="text-sm text-v2-text-secondary">סוחר</p>
          <p className="font-medium text-v2-text-primary">{session?.user?.dealerName}</p>
        </div>
        <div>
          <p className="text-sm text-v2-text-secondary">סטטוס אימות</p>
          <BadgeV2 variant="success">
            {verificationLabel(verificationStatus)}
          </BadgeV2>
        </div>
      </Surface>

      <Surface depth="raised" className="mb-4 space-y-3 p-4">
        <h3 className="font-semibold text-v2-text-primary">פרטי העסק</h3>
        <label className="label">עיר</label>
        <input
          className="input"
          value={profile.city}
          onChange={(e) => setProfile({ ...profile, city: e.target.value })}
        />
        <label className="label">אזור</label>
        <input
          className="input"
          value={profile.region}
          onChange={(e) => setProfile({ ...profile, region: e.target.value })}
        />
        <label className="label">טלפון</label>
        <input
          className="input"
          dir="ltr"
          value={profile.phone}
          onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
        />
        <label className="label">ח.פ./עוסק</label>
        <input
          className="input"
          value={profile.businessId}
          onChange={(e) => setProfile({ ...profile, businessId: e.target.value })}
        />
        <ButtonV2 variant="secondary" disabled={profileSaving} onClick={saveProfile}>
          {profileSaving ? "שומר..." : "שמור פרטים"}
        </ButtonV2>
        {profileMsg && (
          <p className="text-sm text-v2-text-secondary">{profileMsg}</p>
        )}
      </Surface>

      {usage && (
        <Surface depth="raised" className="mb-4 space-y-4 p-4">
          <h3 className="text-h3 font-semibold text-v2-warm">חיבורים</h3>
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
          <p className="text-label text-v2-text-muted">מסלול: {usage.planName}</p>
        </Surface>
      )}

      <div id="push">
      <Surface depth="raised" className="mb-4 p-4">
        <h3 className="mb-3 font-semibold text-v2-text-primary">התראות</h3>
        <PushSettings userId={session?.user?.id} />
      </Surface>
      </div>

      <ButtonV2
        variant="secondary"
        className="mb-4 w-full"
        href="/account/privacy"
      >
        פרטיות ו־AI
      </ButtonV2>

      <ButtonV2
        variant="secondary"
        className="w-full"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        התנתק
      </ButtonV2>
    </div>
  );
}

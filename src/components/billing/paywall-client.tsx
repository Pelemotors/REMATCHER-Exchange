"use client";

import { useEffect, useState } from "react";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";

type PaywallPayload = {
  monetizationEnabled: boolean;
  entitlement: {
    accessStatus: string;
    trialDaysRemaining: number | null;
    planSlug: string | null;
  };
  catalog: Array<{
    slug: string;
    nameHe: string;
    description: string | null;
    products: Array<{
      provider: string;
      externalProductId: string;
      localizedPrice: string | null;
    }>;
  }>;
};

export function PaywallClient() {
  const [data, setData] = useState<PaywallPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/billing/paywall", { cache: "no-store" });
      if (!res.ok) {
        setError("לא ניתן לטעון את מסך המנוי");
        return;
      }
      setData((await res.json()) as PaywallPayload);
    })();
  }, []);

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      const proofs: Array<{ provider: "APPLE" | "GOOGLE"; proof: string }> = [];
      try {
        const { Capacitor, registerPlugin } = await import("@capacitor/core");
        if (Capacitor.isNativePlatform()) {
          const Store = registerPlugin<{
            restore: () => Promise<{ proofs?: Array<{ provider: string; proof: string }> }>;
          }>("StoreBilling");
          const restored = await Store.restore();
          for (const p of restored.proofs ?? []) {
            if (p.provider === "APPLE" || p.provider === "GOOGLE") {
              proofs.push({ provider: p.provider, proof: p.proof });
            }
          }
        }
      } catch {
        /* no native store */
      }
      const res = await fetch("/api/billing/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofs }),
      });
      if (!res.ok) setError("שחזור הרכישות נכשל");
      else {
        const next = await fetch("/api/billing/paywall", { cache: "no-store" });
        if (next.ok) setData((await next.json()) as PaywallPayload);
      }
    } finally {
      setBusy(false);
    }
  }

  async function purchase(provider: "APPLE" | "GOOGLE", productId: string) {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/billing/paywall", { cache: "no-store" });
      const { Capacitor, registerPlugin } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        setError("רכישה מתבצעת מתוך אפליקציית החנות.");
        return;
      }
      const Store = registerPlugin<{
        purchase: (opts: {
          provider: string;
          productId: string;
        }) => Promise<{ proof: string }>;
      }>("StoreBilling");
      const result = await Store.purchase({ provider, productId });
      const path =
        provider === "APPLE"
          ? "/api/billing/apple/verify"
          : "/api/billing/google/verify";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof: result.proof, productId }),
      });
      if (!res.ok) setError("אימות הרכישה נכשל");
    } catch {
      setError("הרכישה בוטלה או לא זמינה במכשיר זה.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <p className="text-sm text-v2-text-muted" role="status">
        {error ?? "טוען…"}
      </p>
    );
  }

  const entitled = ["ACTIVE", "TRIAL", "FOUNDING_DEALER", "GRACE_PERIOD"].includes(
    data.entitlement.accessStatus
  );

  return (
    <div className="mx-auto max-w-lg space-y-5 px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <h1 className="text-2xl font-bold">מנוי REMATCHER Exchange</h1>
      {!data.monetizationEnabled ? (
        <p className="text-sm text-v2-text-secondary">
          המוצר פתוח כרגע ללא תשלום. מנוי החנות יופעל בהחלטת Owner.
        </p>
      ) : entitled ? (
        <p className="text-sm text-v2-text-secondary">
          סטטוס: {data.entitlement.accessStatus}
          {data.entitlement.trialDaysRemaining != null
            ? ` · נותרו ${data.entitlement.trialDaysRemaining} ימי ניסיון`
            : ""}
        </p>
      ) : (
        <p className="text-sm text-v2-text-secondary">
          המידע שלך נשמר. כדי להמשיך להשתמש ב־Exchange צריך מנוי פעיל.
        </p>
      )}

      {data.catalog.map((plan) => (
        <Surface key={plan.slug} depth="raised" className="space-y-3 p-4">
          <h2 className="text-lg font-semibold">{plan.nameHe}</h2>
          {plan.description ? (
            <p className="text-sm text-v2-text-muted">{plan.description}</p>
          ) : null}
          {plan.products.length === 0 ? (
            <p className="text-sm text-v2-text-muted">
              מזהי מוצר בחנות טרם הוגדרו (Owner).
            </p>
          ) : (
            plan.products.map((p) => (
              <ButtonV2
                key={`${p.provider}-${p.externalProductId}`}
                variant="signal"
                className="w-full"
                disabled={busy || !data.monetizationEnabled}
                onClick={() =>
                  void purchase(
                    p.provider === "GOOGLE" ? "GOOGLE" : "APPLE",
                    p.externalProductId
                  )
                }
              >
                {p.localizedPrice
                  ? `${p.provider}: ${p.localizedPrice}`
                  : `${p.provider}: מחיר מהחנות`}
              </ButtonV2>
            ))
          )}
        </Surface>
      ))}

      <ButtonV2
        variant="ghost"
        className="w-full"
        disabled={busy}
        onClick={() => void restore()}
      >
        שחזור רכישות
      </ButtonV2>
      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

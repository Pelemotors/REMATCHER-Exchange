import type {
  BillingEnvironment,
  BillingProvider,
  ProviderSubscriptionStatus,
} from "@prisma/client";

export type NormalizedSubscription = {
  provider: BillingProvider;
  externalSubscriptionId: string;
  externalProductId: string;
  externalTransactionId: string;
  status: ProviderSubscriptionStatus;
  autoRenew: boolean;
  purchasedAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  gracePeriodEndsAt: Date | null;
  environment: BillingEnvironment;
  eventType: string;
  raw: Record<string, unknown>;
};

export type PurchaseProof = {
  /** Opaque store receipt / purchase token */
  proof: string;
  productId?: string;
  environment?: BillingEnvironment;
};

export function isBillingFakeMode(): boolean {
  return process.env.BILLING_PROVIDER_MODE === "fake";
}

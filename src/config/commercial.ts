/** REMATCHER Exchange — Commercial model (configurable, not immutable) */

export const COMMERCIAL_PLANS = {
  onboarding: {
    slug: "onboarding",
    name: "Onboarding",
    monthlyRevealAllowance: 0,
    freeLifetimeAllowance: 5,
    priceIls: 0,
  },
  dealer: {
    slug: "dealer",
    name: "Dealer",
    monthlyRevealAllowance: 15,
    freeLifetimeAllowance: 0,
    priceIls: 2990,
  },
  dealer_pro: {
    slug: "dealer_pro",
    name: "Dealer Pro",
    monthlyRevealAllowance: 30,
    freeLifetimeAllowance: 0,
    priceIls: 5490,
  },
  dealer_max: {
    slug: "dealer_max",
    name: "Dealer Max",
    monthlyRevealAllowance: 60,
    freeLifetimeAllowance: 0,
    priceIls: 8990,
  },
} as const;

export type PlanSlug = keyof typeof COMMERCIAL_PLANS;

export const FREE_LIFETIME_REVEALS = 5;

/** LOCKED DIRECTION — billing event is Reveal created, not Outcome */
export const BILLING_EVENT = "reveal_created" as const;

export interface DealerUsageSummary {
  planSlug: string;
  planName: string;
  planStatus: string;
  freeAllowance: number;
  freeUsed: number;
  freeRemaining: number;
  monthlyAllowance: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  totalRemaining: number;
  billingPeriodStart: Date;
  canReveal: boolean;
  actionRequired: boolean;
}

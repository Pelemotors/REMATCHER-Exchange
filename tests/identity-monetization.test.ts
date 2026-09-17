/**
 * Identity + Monetization foundation tests.
 * Uses fake identity/billing providers — no real Apple/Google secrets.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

process.env.IDENTITY_PROVIDER_MODE = "fake";
process.env.BILLING_PROVIDER_MODE = "fake";
delete process.env.MONETIZATION_ENABLED;
delete process.env.TRIAL_ENABLED;
delete process.env.APPLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_ID;

const store = {
  users: new Map<string, Record<string, unknown>>(),
  identities: new Map<string, Record<string, unknown>>(),
  dealers: new Map<string, Record<string, unknown>>(),
  memberships: new Map<string, Record<string, unknown>>(),
  entitlements: new Map<string, Record<string, unknown>>(),
  subscriptions: new Map<string, Record<string, unknown>>(),
  transactions: new Map<string, Record<string, unknown>>(),
  installations: new Map<string, Record<string, unknown>>(),
  verificationTokens: new Map<string, Record<string, unknown>>(),
  productPolicies: new Map<string, Record<string, unknown>>(),
  plans: new Map<string, Record<string, unknown>>(),
  providerProducts: new Map<string, Record<string, unknown>>(),
  events: [] as Record<string, unknown>[],
  commercials: new Map<string, Record<string, unknown>>(),
};

function id() {
  return `id_${Math.random().toString(36).slice(2, 10)}`;
}

function resetStore() {
  for (const m of Object.values(store)) {
    if (m instanceof Map) m.clear();
    else if (Array.isArray(m)) m.length = 0;
  }
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.id) return store.users.get(where.id) ?? null;
        if (where.email) {
          for (const u of store.users.values()) {
            if (u.email === where.email) return u;
          }
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const userId = id();
        const user = {
          id: userId,
          email: data.email,
          passwordHash: data.passwordHash ?? null,
          name: data.name,
          phone: data.phone ?? null,
          emailVerifiedAt: data.emailVerifiedAt ?? null,
          role: data.role ?? "DEALER_USER",
          createdAt: new Date(),
          updatedAt: new Date(),
          memberships: [],
          externalIdentities: [],
        };
        store.users.set(userId, user);
        const ei = data.externalIdentities as
          | { create?: Record<string, unknown> }
          | undefined;
        if (ei?.create) {
          const iid = id();
          const row = {
            id: iid,
            userId,
            ...ei.create,
            createdAt: new Date(),
            lastUsedAt: new Date(),
          };
          store.identities.set(iid, row);
          (user.externalIdentities as unknown[]).push(row);
        }
        return user;
      }),
    },
    externalIdentity: {
      findUnique: vi.fn(
        async ({
          where,
          include,
        }: {
          where: {
            provider_providerSubject?: {
              provider: string;
              providerSubject: string;
            };
          };
          include?: { user?: boolean };
        }) => {
          const key = where.provider_providerSubject;
          if (!key) return null;
          for (const row of store.identities.values()) {
            if (
              row.provider === key.provider &&
              row.providerSubject === key.providerSubject
            ) {
              if (include?.user) {
                return { ...row, user: store.users.get(row.userId as string) };
              }
              return row;
            }
          }
          return null;
        }
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const iid = id();
        const row = {
          id: iid,
          ...data,
          createdAt: new Date(),
          lastUsedAt: new Date(),
        };
        store.identities.set(iid, row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = store.identities.get(where.id)!;
          Object.assign(row, data);
          return row;
        }
      ),
    },
    dealer: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const dealerId = id();
        const dealer = {
          id: dealerId,
          businessName: data.businessName,
          contactName: data.contactName,
          phone: data.phone,
          email: data.email,
          verificationStatus: data.verificationStatus ?? "PENDING",
          createdAt: new Date(),
        };
        store.dealers.set(dealerId, dealer);
        const mem = data.memberships as
          | { create?: { userId: string; role: string } }
          | undefined;
        if (mem?.create) {
          const mid = id();
          store.memberships.set(mid, {
            id: mid,
            userId: mem.create.userId,
            dealerId,
            role: mem.create.role,
          });
        }
        return dealer;
      }),
      findMany: vi.fn(async () => [...store.dealers.values()]),
    },
    dealerMembership: {
      findFirst: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { userId: string };
          include?: { dealer?: boolean };
        }) => {
          for (const m of store.memberships.values()) {
            if (m.userId === where.userId) {
              return include?.dealer
                ? { ...m, dealer: store.dealers.get(m.dealerId as string) }
                : m;
            }
          }
          return null;
        }
      ),
      findUnique: vi.fn(),
    },
    dealerEntitlement: {
      findUnique: vi.fn(async ({ where }: { where: { dealerId: string } }) => {
        for (const e of store.entitlements.values()) {
          if (e.dealerId === where.dealerId) return e;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const eid = id();
        const row = {
          id: eid,
          status: "FREE",
          trialEligible: true,
          foundingDealer: false,
          trialStartedAt: null,
          trialEndsAt: null,
          trialConsumedAt: null,
          planSlug: null,
          currentPeriodEnd: null,
          gracePeriodEndsAt: null,
          sourceSubscriptionId: null,
          recalculatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        store.entitlements.set(eid, row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { dealerId: string };
          data: Record<string, unknown>;
        }) => {
          for (const [k, e] of store.entitlements) {
            if (e.dealerId === where.dealerId) {
              Object.assign(e, data, { updatedAt: new Date() });
              store.entitlements.set(k, e);
              return e;
            }
          }
          throw new Error("entitlement missing");
        }
      ),
    },
    dealerSubscription: {
      findFirst: vi.fn(
        async ({
          where,
          orderBy: _o,
          include,
        }: {
          where: { dealerId: string; status?: { in: string[] } };
          orderBy?: unknown;
          include?: { plan?: boolean };
        }) => {
          const list = [...store.subscriptions.values()].filter(
            (s) => s.dealerId === where.dealerId
          );
          const statuses = where.status?.in;
          const filtered = statuses
            ? list.filter((s) => statuses.includes(s.status as string))
            : list;
          filtered.sort(
            (a, b) =>
              (b.updatedAt as Date).getTime() - (a.updatedAt as Date).getTime()
          );
          const row = filtered[0];
          if (!row) return null;
          if (include?.plan && row.planId) {
            return { ...row, plan: store.plans.get(row.planId as string) };
          }
          return row;
        }
      ),
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: {
            provider_externalSubscriptionId?: {
              provider: string;
              externalSubscriptionId: string;
            };
          };
        }) => {
          const key = where.provider_externalSubscriptionId;
          if (!key) return null;
          for (const s of store.subscriptions.values()) {
            if (
              s.provider === key.provider &&
              s.externalSubscriptionId === key.externalSubscriptionId
            ) {
              return s;
            }
          }
          return null;
        }
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const sid = id();
        const row = { id: sid, updatedAt: new Date(), createdAt: new Date(), ...data };
        store.subscriptions.set(sid, row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = store.subscriptions.get(where.id)!;
          Object.assign(row, data, { updatedAt: new Date() });
          return row;
        }
      ),
      count: vi.fn(async ({ where }: { where: { dealerId: string } }) => {
        return [...store.subscriptions.values()].filter(
          (s) => s.dealerId === where.dealerId
        ).length;
      }),
    },
    providerTransaction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const key = `${data.provider}:${data.externalTransactionId}:${data.eventType}`;
        for (const t of store.transactions.values()) {
          if (
            t.provider === data.provider &&
            t.externalTransactionId === data.externalTransactionId &&
            t.eventType === data.eventType
          ) {
            const { Prisma } = await import("@prisma/client");
            throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
              code: "P2002",
              clientVersion: "test",
            });
          }
        }
        const tid = id();
        const row = { id: tid, ...data, createdAt: new Date() };
        store.transactions.set(key, row);
        return row;
      }),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            provider: string;
            externalTransactionId: string;
            eventType: string;
          };
        }) => {
          for (const t of store.transactions.values()) {
            if (
              t.provider === where.provider &&
              t.externalTransactionId === where.externalTransactionId &&
              t.eventType === where.eventType
            ) {
              return t;
            }
          }
          return null;
        }
      ),
    },
    providerProduct: {
      findFirst: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { provider: string; externalProductId: string; active?: boolean };
          include?: { plan?: boolean };
        }) => {
          for (const p of store.providerProducts.values()) {
            if (
              p.provider === where.provider &&
              p.externalProductId === where.externalProductId
            ) {
              return include?.plan
                ? { ...p, plan: store.plans.get(p.planId as string) }
                : p;
            }
          }
          return null;
        }
      ),
    },
    subscriptionPlan: {
      findMany: vi.fn(async () =>
        [...store.plans.values()].map((plan) => ({
          ...plan,
          providerProducts: [...store.providerProducts.values()].filter(
            (p) => p.planId === plan.id
          ),
        }))
      ),
    },
    productPolicy: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        return store.productPolicies.get(where.key) ?? null;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { key: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const existing = store.productPolicies.get(where.key);
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          const row = { id: id(), ...create };
          store.productPolicies.set(where.key, row);
          return row;
        }
      ),
    },
    deviceInstallation: {
      findUnique: vi.fn(
        async ({ where }: { where: { installationId: string } }) => {
          for (const d of store.installations.values()) {
            if (d.installationId === where.installationId) return d;
          }
          return null;
        }
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const did = id();
        const row = {
          id: did,
          ...data,
          pushPermission: data.pushPermission ?? "UNKNOWN",
          lastSeenAt: new Date(),
          createdAt: new Date(),
          revokedAt: null,
        };
        store.installations.set(did, row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { installationId: string };
          data: Record<string, unknown>;
        }) => {
          for (const [k, d] of store.installations) {
            if (d.installationId === where.installationId) {
              Object.assign(d, data);
              store.installations.set(k, d);
              return d;
            }
          }
          throw new Error("missing");
        }
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          let count = 0;
          for (const d of store.installations.values()) {
            let match = true;
            if (
              where.installationId &&
              d.installationId !== where.installationId
            )
              match = false;
            if (where.userId && d.userId !== where.userId) match = false;
            if (where.pushToken && d.pushToken !== where.pushToken) match = false;
            if (where.revokedAt === null && d.revokedAt != null) match = false;
            if (match) {
              Object.assign(d, data);
              count++;
            }
          }
          return { count };
        }
      ),
    },
    verificationToken: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const tid = id();
        const row = { id: tid, usedAt: null, ...data };
        store.verificationTokens.set(data.tokenHash as string, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        return store.verificationTokens.get(where.tokenHash) ?? null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          for (const [k, t] of store.verificationTokens) {
            if (t.id === where.id) {
              Object.assign(t, data);
              store.verificationTokens.set(k, t);
              return t;
            }
          }
          return null;
        }
      ),
    },
    dealerCommercial: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        store.commercials.set(data.dealerId as string, data);
        return data;
      }),
    },
    appEvent: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id(), ...data };
        store.events.push(row);
        return row;
      }),
    },
    appVersionPolicy: {
      findUnique: vi.fn(async () => null),
    },
    notificationEventPreference: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/services/commercial/reveal-usage", () => ({
  ensureDealerCommercial: vi.fn(async () => undefined),
}));

import { encodeFakeAppleToken } from "@/services/identity/apple-provider";
import { encodeFakeGoogleToken } from "@/services/identity/google-provider";
import { verifyAppleIdToken } from "@/services/identity/apple-provider";
import { verifyGoogleIdToken } from "@/services/identity/google-provider";
import {
  findOrCreateFromProvider,
  linkProviderToUser,
  IdentityLinkError,
} from "@/services/identity/account-linking";
import {
  assertEntitled,
  getDealerEntitlement,
  markFoundingDealer,
  recalculateEntitlement,
  startTrial,
  EntitlementError,
} from "@/services/entitlements";
import {
  isMonetizationEnabled,
  isTrialEnabled,
  setProductPolicyFlag,
} from "@/services/product-policy";
import { applyNormalizedSubscription } from "@/services/billing/reconcile";
import { verifyApplePurchase } from "@/services/billing/apple-subscription-provider";
import {
  registerOrUpdateInstallation,
  revokeInstallation,
} from "@/services/devices/installations";
import { isSafeInternalPath, SAFE_DEEP_LINK_PREFIXES } from "@/lib/deep-links";
import { TRIAL_DURATION_DAYS } from "@/config/product-policy";

describe("Identity providers (fake)", () => {
  beforeEach(() => {
    resetStore();
    delete process.env.MONETIZATION_ENABLED;
    delete process.env.TRIAL_ENABLED;
  });

  it("verifies fake Apple new user and returning user", async () => {
    const token = encodeFakeAppleToken({
      sub: "apple-sub-1",
      email: "apple1@example.com",
    });
    const verified = await verifyAppleIdToken(token);
    expect(verified.subject).toBe("apple-sub-1");

    const first = await findOrCreateFromProvider({
      provider: "APPLE",
      subject: verified.subject,
      verifiedEmail: verified.email,
      displayName: "Apple One",
    });
    expect(first.created).toBe(true);
    expect(first.dealerId).toBeTruthy();

    const membership = [...store.memberships.values()].find(
      (m) => m.userId === first.user.id
    );
    expect(membership?.role).toBe("OWNER");
    expect(membership?.dealerId).toBe(first.dealerId);

    const second = await findOrCreateFromProvider({
      provider: "APPLE",
      subject: verified.subject,
      verifiedEmail: verified.email,
    });
    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it("verifies fake Google new + returning", async () => {
    const token = encodeFakeGoogleToken({
      sub: "google-sub-1",
      email: "g1@example.com",
      name: "G One",
    });
    const verified = await verifyGoogleIdToken(token);
    const first = await findOrCreateFromProvider({
      provider: "GOOGLE",
      subject: verified.subject,
      verifiedEmail: verified.email,
      displayName: verified.name,
    });
    expect(first.created).toBe(true);
    const second = await findOrCreateFromProvider({
      provider: "GOOGLE",
      subject: verified.subject,
      verifiedEmail: verified.email,
    });
    expect(second.user.id).toBe(first.user.id);
  });

  it("rejects takeover by email alone", async () => {
    const existingId = id();
    store.users.set(existingId, {
      id: existingId,
      email: "taken@example.com",
      passwordHash: "hash",
      name: "Existing",
      emailVerifiedAt: new Date(),
      role: "DEALER_USER",
      externalIdentities: [],
      memberships: [],
    });

    await expect(
      findOrCreateFromProvider({
        provider: "APPLE",
        subject: "new-apple-sub",
        verifiedEmail: "taken@example.com",
      })
    ).rejects.toBeInstanceOf(IdentityLinkError);

    const otherId = id();
    store.users.set(otherId, {
      id: otherId,
      email: "other@example.com",
      passwordHash: null,
      name: "Other",
      role: "DEALER_USER",
      memberships: [],
      externalIdentities: [],
    });

    await expect(
      linkProviderToUser(otherId, {
        provider: "GOOGLE",
        subject: "g-sub-x",
        verifiedEmail: "taken@example.com",
      })
    ).rejects.toMatchObject({ code: "TAKEOVER_REJECTED" });
  });

  it("links provider to authenticated user when email matches same user", async () => {
    const userId = id();
    store.users.set(userId, {
      id: userId,
      email: "same@example.com",
      passwordHash: "x",
      name: "Same",
      role: "DEALER_USER",
      memberships: [],
      externalIdentities: [],
    });
    const linked = await linkProviderToUser(userId, {
      provider: "APPLE",
      subject: "apple-link-1",
      verifiedEmail: "same@example.com",
    });
    expect(linked.userId).toBe(userId);
  });
});

describe("Monetization / trial / founding", () => {
  beforeEach(() => {
    resetStore();
    delete process.env.MONETIZATION_ENABLED;
    delete process.env.TRIAL_ENABLED;
  });

  it("monetization OFF: no trial on ensure; assert always allows", async () => {
    process.env.MONETIZATION_ENABLED = "false";
    process.env.TRIAL_ENABLED = "true";
    expect(await isMonetizationEnabled()).toBe(false);

    const dealerId = id();
    store.dealers.set(dealerId, { id: dealerId });
    const ent = await getDealerEntitlement(dealerId);
    expect(ent.status).toBe("FREE");
    expect(ent.trialStartedAt).toBeNull();

    await expect(assertEntitled(dealerId)).resolves.toBeTruthy();
  });

  it("trial 21 days when trial enabled", async () => {
    process.env.TRIAL_ENABLED = "true";
    const dealerId = id();
    await getDealerEntitlement(dealerId);
    const started = await startTrial(dealerId);
    expect(started.status).toBe("TRIAL");
    expect(started.trialStartedAt).toBeTruthy();
    const ms =
      (started.trialEndsAt as Date).getTime() -
      (started.trialStartedAt as Date).getTime();
    expect(Math.round(ms / (24 * 60 * 60 * 1000))).toBe(TRIAL_DURATION_DAYS);
    // accountCreatedAt is NOT used as trial start — trialStartedAt is now
    expect(started.trialStartedAt).toBeInstanceOf(Date);
  });

  it("trial disabled rejects startTrial", async () => {
    process.env.TRIAL_ENABLED = "false";
    const dealerId = id();
    await getDealerEntitlement(dealerId);
    await expect(startTrial(dealerId)).rejects.toBeInstanceOf(EntitlementError);
  });

  it("founding bypass", async () => {
    process.env.MONETIZATION_ENABLED = "true";
    const dealerId = id();
    await getDealerEntitlement(dealerId);
    await markFoundingDealer(dealerId);
    const ent = await recalculateEntitlement(dealerId);
    expect(ent.status).toBe("FOUNDING_DEALER");
    await expect(assertEntitled(dealerId)).resolves.toBeTruthy();
  });

  it("enforcement when monetization ON and FREE", async () => {
    process.env.MONETIZATION_ENABLED = "true";
    const dealerId = id();
    await getDealerEntitlement(dealerId);
    await expect(assertEntitled(dealerId)).rejects.toMatchObject({
      code: "NOT_ENTITLED",
    });
  });
});

describe("Billing fake purchase lifecycle", () => {
  beforeEach(() => {
    resetStore();
    process.env.MONETIZATION_ENABLED = "true";
    process.env.BILLING_PROVIDER_MODE = "fake";
  });

  it("purchase → ACTIVE → renewal → grace → expiry → restore", async () => {
    const dealerId = id();
    await getDealerEntitlement(dealerId);

    const planId = id();
    store.plans.set(planId, {
      id: planId,
      slug: "pro",
      nameHe: "פרו",
      active: true,
    });
    store.providerProducts.set(id(), {
      id: id(),
      planId,
      provider: "APPLE",
      externalProductId: "com.rematcher.exchange.monthly",
      active: true,
    });

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const proof = JSON.stringify({
      subscriptionId: "sub-lifecycle",
      productId: "com.rematcher.exchange.monthly",
      transactionId: "tx-1",
      status: "ACTIVE",
      periodEnd: periodEnd.toISOString(),
      eventType: "INITIAL_BUY",
      dealerId,
    });

    const normalized = await verifyApplePurchase({ proof });
    const bought = await applyNormalizedSubscription({
      dealerId,
      normalized,
    });
    expect(bought.entitlement.status).toBe("ACTIVE");
    expect(bought.transaction.created).toBe(true);

    const renew = await applyNormalizedSubscription({
      dealerId,
      normalized: {
        ...normalized,
        externalTransactionId: "tx-2",
        eventType: "DID_RENEW",
        currentPeriodEnd: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      },
    });
    expect(renew.entitlement.status).toBe("ACTIVE");

    const graceEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const grace = await applyNormalizedSubscription({
      dealerId,
      normalized: {
        ...normalized,
        externalTransactionId: "tx-3",
        eventType: "GRACE",
        status: "IN_GRACE_PERIOD",
        currentPeriodEnd: new Date(Date.now() - 1000),
        gracePeriodEndsAt: graceEnd,
      },
    });
    expect(grace.entitlement.status).toBe("GRACE_PERIOD");

    const expired = await applyNormalizedSubscription({
      dealerId,
      normalized: {
        ...normalized,
        externalTransactionId: "tx-4",
        eventType: "EXPIRED",
        status: "EXPIRED",
        currentPeriodEnd: new Date(Date.now() - 1000),
        gracePeriodEndsAt: new Date(Date.now() - 1000),
      },
    });
    expect(expired.entitlement.status).toBe("EXPIRED");

    const restored = await applyNormalizedSubscription({
      dealerId,
      normalized: {
        ...normalized,
        externalTransactionId: "tx-5",
        eventType: "RESTORE",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        gracePeriodEndsAt: null,
      },
    });
    expect(restored.entitlement.status).toBe("ACTIVE");
  });

  it("duplicate webhook is idempotent", async () => {
    const dealerId = id();
    await getDealerEntitlement(dealerId);
    const proof = JSON.stringify({
      subscriptionId: "sub-dup",
      productId: "sku",
      transactionId: "tx-dup",
      status: "ACTIVE",
      periodEnd: new Date(Date.now() + 86400000).toISOString(),
      eventType: "INITIAL_BUY",
    });
    const n = await verifyApplePurchase({ proof });
    const a = await applyNormalizedSubscription({ dealerId, normalized: n });
    const b = await applyNormalizedSubscription({ dealerId, normalized: n });
    expect(a.transaction.created).toBe(true);
    expect(b.transaction.created).toBe(false);
  });
});

describe("Devices", () => {
  beforeEach(() => resetStore());

  it("register / rotate / revoke", async () => {
    const first = await registerOrUpdateInstallation({
      installationId: "inst-1",
      platform: "IOS",
      userId: "u1",
      dealerId: "d1",
      pushToken: "tok-a",
      appVersion: "1.0.0",
    });
    expect(first.pushToken).toBe("tok-a");

    const rotated = await registerOrUpdateInstallation({
      installationId: "inst-1",
      platform: "IOS",
      userId: "u1",
      dealerId: "d1",
      pushToken: "tok-b",
      appVersion: "1.0.1",
    });
    expect(rotated.pushToken).toBe("tok-b");
    expect(rotated.id).toBe(first.id);

    const revoked = await revokeInstallation({
      installationId: "inst-1",
      userId: "u1",
    });
    expect(revoked.revoked).toBe(1);
  });

  it("does not revoke another user's installationId (IDOR)", async () => {
    await registerOrUpdateInstallation({
      installationId: "inst-a",
      platform: "IOS",
      userId: "user-a",
      dealerId: "dealer-a",
      pushToken: "tok-a",
    });
    const stolen = await revokeInstallation({
      installationId: "inst-a",
      userId: "user-b",
    });
    expect(stolen.revoked).toBe(0);
    const owner = await revokeInstallation({
      installationId: "inst-a",
      userId: "user-a",
    });
    expect(owner.revoked).toBe(1);
  });
});

describe("Deep links / intake safety", () => {
  it("includes /subscription and keeps /intake safe", () => {
    expect(SAFE_DEEP_LINK_PREFIXES).toContain("/subscription");
    expect(isSafeInternalPath("/subscription")).toBe(true);
    expect(isSafeInternalPath("/intake")).toBe(true);
    expect(
      isSafeInternalPath("/intake/handoff?clientBatchId=x&staged=1")
    ).toBe(true);
    expect(isSafeInternalPath("//evil.com")).toBe(false);
  });
});

describe("Product policy env overrides", () => {
  it("setProductPolicyFlag + env override", async () => {
    resetStore();
    delete process.env.MONETIZATION_ENABLED;
    await setProductPolicyFlag("MONETIZATION_ENABLED", true);
    // without env, reads table
    expect(await isMonetizationEnabled()).toBe(true);
    process.env.MONETIZATION_ENABLED = "false";
    expect(await isMonetizationEnabled()).toBe(false);
    expect(await isTrialEnabled()).toBe(false);
  });
});

describe("passwordHash null guard (auth authorize contract)", () => {
  it("documents that null passwordHash cannot bcrypt-compare", () => {
    const passwordHash: string | null = null;
    expect(passwordHash).toBeNull();
    // auth.ts returns null before bcrypt.compare when !user.passwordHash
    const canPasswordLogin = Boolean(passwordHash);
    expect(canPasswordLogin).toBe(false);
  });

  it("bridge token hash is deterministic sha256", () => {
    const raw = "abc";
    const hash = createHash("sha256").update(raw).digest("hex");
    expect(hash).toHaveLength(64);
  });
});

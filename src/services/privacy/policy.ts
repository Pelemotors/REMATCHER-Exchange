/**
 * Central Privacy & AI Policy Service (deterministic).
 * AI must not decide these permissions.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { PrivacyConsentType } from "@prisma/client";
import {
  CONSENT_TEXT_VERSION,
  PRIVACY_CONSENT_TYPES,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  type PrivacyConsentTypeKey,
} from "@/config/legal/versions";
import {
  sanitizeExchangePayload,
  scrubProhibitedText,
} from "@/services/privacy/sanitizer";

export type ConsentState = Record<PrivacyConsentTypeKey, boolean>;

export const DEFAULT_CONSENT_STATE: ConsentState = {
  DEALER_MEMORY: false,
  AGENT_TO_EXCHANGE_LEARNING: false,
  EXCHANGE_ACTIVITY_LEARNING: false,
  EXTERNAL_ACTIVITY_LEARNING: false,
};

export function getRetentionPolicy() {
  return {
    agentConversationsMonths: 24,
    historicalInventoryDemandMonths: 36,
    matchInterestRevealMonths: 36,
    exchangeEventsCasesYears: 5,
    consentHistoryYearsAfterAccountEnd: 3,
    backupCycleDaysMax: 90,
    dealerMemory: "while_relevant_and_account_active",
    exchangeLearnings: "while_relevant_with_lifecycle",
  } as const;
}

export async function getConsentState(dealerId: string): Promise<ConsentState> {
  const state = { ...DEFAULT_CONSENT_STATE };
  for (const type of PRIVACY_CONSENT_TYPES) {
    const latest = await prisma.privacyConsentDecision.findFirst({
      where: { dealerId, consentType: type },
      orderBy: { createdAt: "desc" },
      select: { value: true },
    });
    state[type] = latest?.value ?? false;
  }
  return state;
}

export async function hasCompletedPrivacyAiV1(params: {
  userId: string;
  dealerId: string;
}): Promise<boolean> {
  const row = await prisma.privacyAiOnboardingState.findUnique({
    where: {
      userId_dealerId: { userId: params.userId, dealerId: params.dealerId },
    },
    select: { completedAt: true },
  });
  return Boolean(row?.completedAt);
}

export async function mayPersistDealerMemory(dealerId: string): Promise<boolean> {
  const s = await getConsentState(dealerId);
  return s.DEALER_MEMORY === true;
}

export async function mayDeriveAgentExchangeEvent(
  dealerId: string,
  eventType: string
): Promise<boolean> {
  const s = await getConsentState(dealerId);
  const external = eventType.startsWith("EXTERNAL_");
  if (external) return s.EXTERNAL_ACTIVITY_LEARNING === true;
  // Agent-derived business outcomes need AGENT_TO_EXCHANGE_LEARNING
  return s.AGENT_TO_EXCHANGE_LEARNING === true;
}

export async function mayUseExchangeActivityForLearning(
  dealerId: string
): Promise<boolean> {
  const s = await getConsentState(dealerId);
  return s.EXCHANGE_ACTIVITY_LEARNING === true;
}

export async function mayUseExternalActivityForLearning(
  dealerId: string
): Promise<boolean> {
  const s = await getConsentState(dealerId);
  return s.EXTERNAL_ACTIVITY_LEARNING === true;
}

/** Internal learning may use dealerId; disclosure remains Reveal-gated. */
export function mayUseDealerIdentityInternally(): boolean {
  return true;
}

export function mayExposeDealerIdentity(params: {
  revealAuthorized: boolean;
}): boolean {
  return params.revealAuthorized === true;
}

export function mayProcessOperationally(): boolean {
  return true;
}

export function mayPersistFieldToExchangeMemory(field: string): boolean {
  const blocked = [
    "closingPrice",
    "floorPrice",
    "margin",
    "negotiation",
    "customer",
    "transcript",
    "dealerMemory",
  ];
  return !blocked.some((b) => field.toLowerCase().includes(b.toLowerCase()));
}

export function sanitizeExchangeEvent(data: Record<string, unknown> | null | undefined) {
  return sanitizeExchangePayload(data, { allowlistOnly: false });
}

export async function recordConsentDecision(params: {
  userId: string;
  dealerId: string;
  consentType: PrivacyConsentType | PrivacyConsentTypeKey;
  value: boolean;
  source?: string;
}) {
  return prisma.privacyConsentDecision.create({
    data: {
      userId: params.userId,
      dealerId: params.dealerId,
      consentType: params.consentType as PrivacyConsentType,
      value: params.value,
      consentTextVersion: CONSENT_TEXT_VERSION,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      source: params.source ?? "privacy_center",
    },
  });
}

export async function completePrivacyAiOnboarding(params: {
  userId: string;
  dealerId: string;
  consents: ConsentState;
  source?: string;
}) {
  // Persist each optional choice (append-only) — does NOT infer from Terms.
  for (const type of PRIVACY_CONSENT_TYPES) {
    await recordConsentDecision({
      userId: params.userId,
      dealerId: params.dealerId,
      consentType: type,
      value: params.consents[type] === true,
      source: params.source ?? "privacy_ai_onboarding",
    });
  }

  await prisma.legalAcceptance.create({
    data: {
      userId: params.userId,
      dealerId: params.dealerId,
      termsVersion: TERMS_VERSION,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      consentTextVersion: CONSENT_TEXT_VERSION,
      source: params.source ?? "privacy_ai_onboarding",
    },
  });

  await prisma.privacyAiOnboardingState.upsert({
    where: {
      userId_dealerId: { userId: params.userId, dealerId: params.dealerId },
    },
    create: {
      userId: params.userId,
      dealerId: params.dealerId,
      completedAt: new Date(),
    },
    update: { completedAt: new Date() },
  });
}

export async function listConsentHistory(dealerId: string, consentType?: PrivacyConsentTypeKey) {
  return prisma.privacyConsentDecision.findMany({
    where: {
      dealerId,
      ...(consentType ? { consentType } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

export { scrubProhibitedText };

import type { ParsedDemand } from "@/lib/schemas/ai";
import {
  extractCustomerHintsFromText,
  isSafePhoneForPersist,
  type CaptureCustomerHints,
} from "@/services/capture/customer-extract";
import { looksLikeCustomerDemandText } from "@/services/intake/classify-intake-pass";

export type IntakeDemandDraftCustomerHint = {
  name: string | null;
  confirmedPhone: string | null;
  phoneCandidates: Array<{
    raw: string;
    normalized: string | null;
    attribution: string;
    confidence: string;
  }>;
  requiresPhoneConfirmation: boolean;
};

export type IntakeDemandDraftPayload = {
  rawText: string;
  parsed: ParsedDemand;
  summaryHe?: string;
  mediaIds?: string[];
  status: "PENDING_DEALER_CONFIRM";
  customerHint: IntakeDemandDraftCustomerHint;
};

export function buildCustomerHintPayload(
  hints: CaptureCustomerHints
): IntakeDemandDraftCustomerHint {
  const safePhone = isSafePhoneForPersist(hints);
  const requiresPhoneConfirmation =
    !safePhone &&
    hints.phoneCandidates.some(
      (c) => c.confidence === "high" || c.confidence === "medium"
    );
  return {
    name: hints.name,
    confirmedPhone: safePhone ? hints.normalizedPhone ?? hints.phone : null,
    phoneCandidates: hints.phoneCandidates.map((c) => ({
      raw: c.raw,
      normalized: c.normalized,
      attribution: c.attribution,
      confidence: c.confidence,
    })),
    requiresPhoneConfirmation,
  };
}

/** Pure builder for batch demandDraft (summary supplied by caller after parse). */
export function buildIntakeDemandDraft(input: {
  conversationText: string;
  parsed: ParsedDemand;
  summaryHe: string;
  conversationMediaIds?: string[];
}): IntakeDemandDraftPayload | null {
  const conversationText = input.conversationText.trim();
  if (!looksLikeCustomerDemandText(conversationText)) return null;
  const hints = extractCustomerHintsFromText(conversationText);
  return {
    rawText: conversationText,
    parsed: input.parsed,
    summaryHe: input.summaryHe,
    mediaIds: input.conversationMediaIds,
    status: "PENDING_DEALER_CONFIRM",
    customerHint: buildCustomerHintPayload(hints),
  };
}

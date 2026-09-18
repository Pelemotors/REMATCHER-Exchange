import "server-only";
import type { ConversationState } from "@/services/assistant/conversation-state";
import { logAppEvent } from "@/services/notifications";

/** Hebrew/English phrases that imply a mutation or confirmation gate exists. */
const CONFIRMATION_CLAIM_RE =
  /(?:ממתין(?:ה)?\s*(?:ל)?אישור|לאישור(?:ך)?|לאשר|צריך\s*אישור|לשמור\s*א(?:ת|תה)?\s*הרכב|ה(?:אם|אם)\s*לאשר|confirm(?:ation)?|pending\s+approval)/iu;

const MUTATION_SUCCESS_CLAIM_RE =
  /(?:נשמר(?:ה)?\s*(?:במלאי|בהצלחה)?|נוסף(?:ה)?\s*למלאי|הושל(?:ם|מה)|עודכ(?:ן|נה)\s*במערכת|בוצע(?:ה)?\s*ה(?:פעולה|שינוי)|ה(?:רכב|קליטה)\s*נ(?:שמר|דחה)|saved\s+to\s+inventory|mutation\s+(?:completed|succeeded)|successfully\s+(?:saved|updated|created))/iu;

export function assistantTextClaimsPendingConfirmation(text: string): boolean {
  return CONFIRMATION_CLAIM_RE.test(text.trim());
}

export function assistantTextClaimsMutationSuccess(text: string): boolean {
  return MUTATION_SUCCESS_CLAIM_RE.test(text.trim());
}

/**
 * Strip internal privacy boilerplate from intelligence payloads shown to dealers.
 */
export function stripInternalPrivacyNote<T extends Record<string, unknown>>(
  payload: T
): Omit<T, "privacyNote"> {
  const { privacyNote: _removed, ...rest } = payload;
  return rest;
}

const INTERNAL_PRIVACY_NOTE =
  "Anonymous aggregates only. Raw cross-dealer rows are never returned.";

export function sanitizeUserFacingAssistantMessage(
  message: string,
  conversation?: ConversationState
): string {
  let out = message.trim();
  if (!out) return out;

  const hasPending = Boolean(conversation?.pendingConfirmation);
  if (!hasPending && assistantTextClaimsPendingConfirmation(out)) {
    out =
      "כדי לבצע שינוי במערכת צריך אישור מפורש — עדיין אין פעולה ממתינה. אם תרצה, אפשר לנסח שוב מה לבצע.";
  }
  if (hasPending && assistantTextClaimsMutationSuccess(out)) {
    out =
      "הפעולה עדיין ממתינה לאישורך — לא בוצע שינוי במערכת עד שתאשר.";
  }
  if (!hasPending && assistantTextClaimsMutationSuccess(out)) {
    out =
      "לא בוצעה פעולה במערכת בשיחה הזו. אם צריך שינוי — אבקש אישור דרך הערוץ הרשמי.";
  }
  return out;
}

export async function logPendingConfirmationInconsistency(params: {
  dealerId: string;
  userMessage: string;
  conversation?: ConversationState;
  reason: "confirm_without_pending" | "assistant_claim_without_pending";
}) {
  const turns = params.conversation?.recentTurns ?? [];
  const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant");
  const priorClaimedPending =
    lastAssistant && assistantTextClaimsPendingConfirmation(lastAssistant.text);

  if (!priorClaimedPending && params.reason !== "confirm_without_pending") {
    return;
  }

  try {
    await logAppEvent({
      eventType: "assistant_action_truth_inconsistency",
      dealerId: params.dealerId,
      metadata: {
        reason: params.reason,
        userMessage: params.userMessage.slice(0, 200),
        priorAssistantSnippet: lastAssistant?.text.slice(0, 300) ?? null,
        hadPendingInState: Boolean(params.conversation?.pendingConfirmation),
      },
    });
  } catch {
    /* telemetry must not block chat */
  }
}

export { INTERNAL_PRIVACY_NOTE };

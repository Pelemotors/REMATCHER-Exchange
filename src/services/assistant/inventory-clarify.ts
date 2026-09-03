import "server-only";
import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import {
  callOpenAIStructured,
  isOpenAIConfigured,
  logAiOperation,
} from "@/services/ai/client";
import { INVENTORY_COMMERCIAL_PLAYBOOK } from "@/services/assistant/inventory-commercial-playbook";
import {
  gapQuestion,
  nextGapToAsk,
  type InventoryGapId,
  type PendingInventoryDraft,
} from "@/services/assistant/inventory-draft";

export type ClarificationDecision = {
  gap: InventoryGapId | null;
  question: string;
  commerciallyComplete: boolean;
  source: "ai" | "deterministic";
};

const WORDING_SCHEMA = {
  type: "object",
  properties: {
    questionHe: { type: "string" },
  },
  required: ["questionHe"],
  additionalProperties: false,
} as const;

/**
 * Decide next clarification. Deterministic commercial policy owns which gap;
 * AI may polish Hebrew wording when configured.
 */
export async function decideInventoryClarification(params: {
  draft: PendingInventoryDraft;
  userId?: string;
}): Promise<ClarificationDecision> {
  const gap = nextGapToAsk(params.draft);
  const deterministicQ = gap
    ? gapQuestion(gap, params.draft.fields)
    : "לשמור במלאי?";

  if (!gap) {
    return {
      gap: null,
      question: deterministicQ,
      commerciallyComplete: true,
      source: "deterministic",
    };
  }

  if (!isOpenAIConfigured()) {
    await logAiOperation({
      operation: "inventory_clarification",
      promptVersion: AI_PROMPT_VERSIONS.inventoryClarification,
      success: true,
      userId: params.userId,
      usageJson: { fallback: true, gap },
    });
    return {
      gap,
      question: deterministicQ,
      commerciallyComplete: false,
      source: "deterministic",
    };
  }

  try {
    const f = params.draft.fields;
    const { data } = await callOpenAIStructured<{ questionHe: string }>({
      operation: "inventory_clarification",
      promptVersion: AI_PROMPT_VERSIONS.inventoryClarification,
      model: AI_MODELS.inventoryClarification,
      systemPrompt: `${INVENTORY_COMMERCIAL_PLAYBOOK}

Write ONE short Hebrew clarification question for the given gap.
No technical jargon. Do not invent facts. Do not ask about other fields.`,
      userContent: JSON.stringify({
        gap,
        known: {
          make: f.make,
          model: f.model,
          year: f.year,
          mileage: f.mileage,
          b2bPrice: f.b2bPrice,
        },
        defaultQuestion: deterministicQ,
      }),
      schemaName: "inventory_clarification_wording",
      schema: WORDING_SCHEMA as unknown as Record<string, unknown>,
      userId: params.userId,
    });

    const polished = data.questionHe?.trim();
    return {
      gap,
      question: polished && polished.length < 180 ? polished : deterministicQ,
      commerciallyComplete: false,
      source: "ai",
    };
  } catch {
    return {
      gap,
      question: deterministicQ,
      commerciallyComplete: false,
      source: "deterministic",
    };
  }
}

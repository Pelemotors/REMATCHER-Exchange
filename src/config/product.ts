import { z } from "zod";

/** LOCKED thresholds from PRD §33 */
export const SCORE_THRESHOLDS = {
  STRONG_MIN: 90,
  ALTERNATIVE_MIN: 75,
  MAX_ALTERNATIVES: 3,
} as const;

/** LOCKED budget rule from PRD §31 */
export const BUDGET_RULE = {
  SOFT_OVER_PERCENT: 10,
} as const;

/** LOCKED demand lifetime from PRD §25 */
export const DEMAND_LIFETIME_DAYS = 3;

/** Configurable — P-03 OPEN */
export const DEFAULT_PRODUCT_CONFIG = {
  /** null = use freshness policy module without hard-coded days */
  freshnessStaleDays: null as number | null,
  /** null = no fixed B2B price validity — P-02 OPEN */
  b2bPriceValidityDays: null as number | null,
  /** P-07 OPEN — weights configurable */
  matchingWeights: {
    year: 25,
    makeModel: 25,
    trim: 15,
    mileage: 15,
    color: 10,
    budget: 20,
  },
  /** Minimum fields for matching — P-01 OPEN; empty = permissive mode */
  requiredVehicleFieldsForMatching: [] as string[],
  /** Reveal fields — partially OPEN */
  revealFields: ["businessName", "contactName", "phone"] as string[],
};

export type ProductConfig = typeof DEFAULT_PRODUCT_CONFIG;

const configSchema = z.object({
  freshnessStaleDays: z.number().nullable().optional(),
  b2bPriceValidityDays: z.number().nullable().optional(),
  matchingWeights: z
    .object({
      year: z.number(),
      makeModel: z.number(),
      trim: z.number(),
      mileage: z.number(),
      color: z.number(),
      budget: z.number(),
    })
    .optional(),
  requiredVehicleFieldsForMatching: z.array(z.string()).optional(),
  revealFields: z.array(z.string()).optional(),
});

let cachedConfig: ProductConfig | null = null;

export function getProductConfig(): ProductConfig {
  if (cachedConfig) return cachedConfig;

  const base = { ...DEFAULT_PRODUCT_CONFIG };

  if (process.env.PRODUCT_CONFIG_JSON) {
    try {
      const parsed = configSchema.parse(
        JSON.parse(process.env.PRODUCT_CONFIG_JSON)
      );
      cachedConfig = { ...base, ...parsed } as ProductConfig;
      return cachedConfig;
    } catch {
      // fall through
    }
  }

  cachedConfig = base;
  return cachedConfig;
}

export function resetProductConfigCache() {
  cachedConfig = null;
}

export const AI_PROMPT_VERSIONS = {
  demandParser: "demand-parser-v1",
  inventoryNormalizer: "inventory-normalizer-v2",
  inventoryClarification: "inventory-clarification-v1",
  inventoryUnderstanding: "inventory-understanding-v1",
  turnInterpreter: "turn-interpreter-v1",
  turnPlanner: "turn-planner-v1.1",
  agentLoop: "agent-loop-v5.1.0-constitution-2.0-dealer-memory-1.0-he",
  matchExplainer: "match-explainer-v1",
} as const;

export const AI_MODELS = {
  demandParser: process.env.OPENAI_DEMAND_PARSER_MODEL ?? "gpt-4o-mini",
  inventoryNormalizer:
    process.env.OPENAI_INVENTORY_NORMALIZER_MODEL ?? "gpt-4o-mini",
  inventoryClarification:
    process.env.OPENAI_INVENTORY_CLARIFICATION_MODEL ?? "gpt-4o-mini",
  inventoryUnderstanding:
    process.env.OPENAI_INVENTORY_UNDERSTANDING_MODEL ?? "gpt-4o-mini",
  turnInterpreter:
    process.env.OPENAI_TURN_INTERPRETER_MODEL ?? "gpt-4o-mini",
  turnPlanner: process.env.OPENAI_TURN_PLANNER_MODEL ?? "gpt-4o-mini",
  agentLoop: process.env.OPENAI_AGENT_LOOP_MODEL ?? "gpt-5.4-mini",
  matchExplainer: process.env.OPENAI_MATCH_EXPLAINER_MODEL ?? "gpt-4o-mini",
} as const;

/** Bound Agent 4.0 tool rounds (model→tools→model cycles after the first call) */
export const AGENT_LOOP_MAX_ROUNDS = 4;
export const AGENT_LOOP_MAX_TOOLS_PER_ROUND = 6;

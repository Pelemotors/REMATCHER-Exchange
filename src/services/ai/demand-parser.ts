import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import {
  parsedDemandSchema,
  type ParsedDemand,
} from "@/lib/schemas/ai";
import { callOpenAIStructured, isOpenAIConfigured, logAiOperation } from "./client";
import {
  JSON_SCHEMA_CONSTRAINT_ITEM,
  JSON_SCHEMA_STATUS_FIELD,
} from "./json-schemas";

const SYSTEM_PROMPT = `You parse Hebrew/English natural language vehicle demand for a B2B dealer exchange.
Rules (CRITICAL):
- NEVER invent constraints the user did not state (I-08). Knowledge about vehicles must NOT become mandatory constraints.
- If information is not stated, mark field status as "unknown" or list in ambiguities.
- Field status must be exactly one of: "known", "unknown", "ambiguous". Never use other status labels.
- Distinguish hardConstraints (explicit must-have), softPreferences (nice-to-have), exclusions (explicit not-wanted).
- Budget in ILS unless stated otherwise.
- Year "22" means 2022.
- Return structured JSON only.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    make: JSON_SCHEMA_STATUS_FIELD,
    model: JSON_SCHEMA_STATUS_FIELD,
    yearMin: JSON_SCHEMA_STATUS_FIELD,
    yearMax: JSON_SCHEMA_STATUS_FIELD,
    budgetMax: JSON_SCHEMA_STATUS_FIELD,
    trimPreference: JSON_SCHEMA_STATUS_FIELD,
    mileageMax: JSON_SCHEMA_STATUS_FIELD,
    seatsMin: JSON_SCHEMA_STATUS_FIELD,
    colorExclusions: { type: "array", items: { type: "string" } },
    colorPreferences: { type: "array", items: { type: "string" } },
    hardConstraints: {
      type: "array",
      items: JSON_SCHEMA_CONSTRAINT_ITEM,
    },
    softPreferences: {
      type: "array",
      items: JSON_SCHEMA_CONSTRAINT_ITEM,
    },
    exclusions: {
      type: "array",
      items: JSON_SCHEMA_CONSTRAINT_ITEM,
    },
    ambiguities: { type: "array", items: { type: "string" } },
    rawSummary: { type: "string" },
  },
  required: [
    "make",
    "model",
    "yearMin",
    "yearMax",
    "budgetMax",
    "trimPreference",
    "mileageMax",
    "seatsMin",
    "colorExclusions",
    "colorPreferences",
    "hardConstraints",
    "softPreferences",
    "exclusions",
    "ambiguities",
    "rawSummary",
  ],
  additionalProperties: false,
} as const;

/** Fallback parser when OpenAI unavailable — minimal, no invented constraints */
export function parseDemandFallback(rawText: string): ParsedDemand {
  const text = rawText.toLowerCase();
  const result: ParsedDemand = {
    hardConstraints: [],
    softPreferences: [],
    exclusions: [],
    ambiguities: [],
    rawSummary: rawText,
  };

  if (text.includes("מאזדה") || text.includes("mazda")) {
    result.make = { value: "Mazda", status: "known", source: "inferred" };
  }

  // CX-5 pattern from demo
  if (text.includes("cx") || text.includes("cx5") || text.includes("cx-5")) {
    result.make = { value: "Mazda", status: "known", source: "inferred" };
    result.model = { value: "CX-5", status: "known", source: "inferred" };
  }

  const yearMatch = text.match(/(?:20)?(\d{2})\s*(?:ומעלה|\+|and up)?/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    result.yearMin = { value: y < 100 ? 2000 + y : y, status: "known" };
  }

  const budgetMatch = text.match(/(?:עד|max|up to)\s*(\d+)/);
  if (budgetMatch) {
    let budget = parseInt(budgetMatch[1], 10);
    if (budget < 1000) budget *= 1000;
    result.budgetMax = { value: budget, status: "known" };
  }

  if (text.includes("לא אדום") || text.includes("not red")) {
    result.exclusions.push({
      field: "color",
      description: "לא אדום",
      value: "red",
    });
  }

  if (text.includes("מפואר") || text.includes("premium") || text.includes("high trim")) {
    result.softPreferences.push({
      field: "trim",
      description: "עדיפות לגרסה מפוארת",
      value: "high_trim",
    });
  }

  return parsedDemandSchema.parse(result);
}

type StatusField = { value?: unknown; status?: string; source?: string } | null | undefined;

function normalizeStatusField(field: StatusField): StatusField {
  if (!field || typeof field !== "object") return field;
  const allowed = new Set(["known", "unknown", "ambiguous"]);
  if (field.status && allowed.has(field.status)) return field;
  return {
    ...field,
    status:
      field.value != null && field.value !== ""
        ? "known"
        : "unknown",
  };
}

function sanitizeParsedDemand(data: unknown): ParsedDemand {
  const copy = { ...(data as ParsedDemand) };
  const fields = [
    "make",
    "model",
    "yearMin",
    "yearMax",
    "budgetMax",
    "trimPreference",
    "mileageMax",
    "seatsMin",
  ] as const;
  const copy = { ...data };
  for (const key of fields) {
    const normalized = normalizeStatusField(copy[key]);
    if (normalized !== undefined) {
      (copy as Record<string, unknown>)[key] = normalized;
    }
  }
  return copy;
}

async function logDemandParseFallback(
  reason: string,
  userId?: string
): Promise<void> {
  await logAiOperation({
    operation: "demand_parse",
    promptVersion: AI_PROMPT_VERSIONS.demandParser,
    model: AI_MODELS.demandParser,
    success: false,
    errorMessage: reason,
    userId,
  });
}

export async function parseDemand(
  rawText: string,
  userId?: string
): Promise<ParsedDemand> {
  if (!isOpenAIConfigured()) {
    await logDemandParseFallback(
      "OPENAI_API_KEY not configured — deterministic fallback",
      userId
    );
    return parseDemandFallback(rawText);
  }

  try {
    const { data } = await callOpenAIStructured<ParsedDemand>({
      operation: "demand_parse",
      promptVersion: AI_PROMPT_VERSIONS.demandParser,
      model: AI_MODELS.demandParser,
      systemPrompt: SYSTEM_PROMPT,
      userContent: rawText,
      schemaName: "parsed_demand",
      schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      userId,
    });

    return parsedDemandSchema.parse(sanitizeParsedDemand(data));
  } catch (error) {
    await logDemandParseFallback(
      `OpenAI demand parse failed — deterministic fallback: ${
        error instanceof Error ? error.message : "unknown"
      }`,
      userId
    );
    return parseDemandFallback(rawText);
  }
}

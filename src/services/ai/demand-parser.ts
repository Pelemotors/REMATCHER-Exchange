import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import {
  parsedDemandSchema,
  type ParsedDemand,
} from "@/lib/schemas/ai";
import { callOpenAIStructured, isOpenAIConfigured } from "./client";

const SYSTEM_PROMPT = `You parse Hebrew/English natural language vehicle demand for a B2B dealer exchange.
Rules (CRITICAL):
- NEVER invent constraints the user did not state (I-08). Knowledge about vehicles must NOT become mandatory constraints.
- If information is not stated, mark field status as "unknown" or list in ambiguities.
- Distinguish hardConstraints (explicit must-have), softPreferences (nice-to-have), exclusions (explicit not-wanted).
- Budget in ILS unless stated otherwise.
- Year "22" means 2022.
- Return structured JSON only.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    make: { type: ["object", "null"], properties: { value: {}, status: { type: "string" } }, required: ["value", "status"], additionalProperties: false },
    model: { type: ["object", "null"], properties: { value: {}, status: { type: "string" } }, required: ["value", "status"], additionalProperties: false },
    yearMin: { type: ["object", "null"], properties: { value: {}, status: { type: "string" } }, required: ["value", "status"], additionalProperties: false },
    yearMax: { type: ["object", "null"], properties: { value: {}, status: { type: "string" } }, required: ["value", "status"], additionalProperties: false },
    budgetMax: { type: ["object", "null"], properties: { value: {}, status: { type: "string" } }, required: ["value", "status"], additionalProperties: false },
    trimPreference: { type: ["object", "null"], properties: { value: {}, status: { type: "string" } }, required: ["value", "status"], additionalProperties: false },
    mileageMax: { type: ["object", "null"], properties: { value: {}, status: { type: "string" } }, required: ["value", "status"], additionalProperties: false },
    seatsMin: { type: ["object", "null"], properties: { value: {}, status: { type: "string" } }, required: ["value", "status"], additionalProperties: false },
    colorExclusions: { type: "array", items: { type: "string" } },
    colorPreferences: { type: "array", items: { type: "string" } },
    hardConstraints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          description: { type: "string" },
          value: {},
        },
        required: ["field", "description", "value"],
        additionalProperties: false,
      },
    },
    softPreferences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          description: { type: "string" },
          value: {},
        },
        required: ["field", "description", "value"],
        additionalProperties: false,
      },
    },
    exclusions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          description: { type: "string" },
          value: {},
        },
        required: ["field", "description", "value"],
        additionalProperties: false,
      },
    },
    ambiguities: { type: "array", items: { type: "string" } },
    rawSummary: { type: "string" },
  },
  required: [
    "hardConstraints",
    "softPreferences",
    "exclusions",
    "ambiguities",
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
    ambiguities: ["Parsing via fallback — OpenAI unavailable"],
    rawSummary: rawText,
  };

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

export async function parseDemand(
  rawText: string,
  userId?: string
): Promise<ParsedDemand> {
  if (!isOpenAIConfigured()) {
    return parseDemandFallback(rawText);
  }

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

  return parsedDemandSchema.parse(data);
}

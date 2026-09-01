import "server-only";
import {
  callOpenAIStructured,
  isOpenAIConfigured,
  AI_MODELS,
} from "@/services/ai/client";
import { PLANNER_PROMPT } from "@/services/assistant/agent-constitution";
import {
  ALL_READ_TOOLS,
  TOOL_DESCRIPTIONS,
  type AgentPlan,
  type ReadToolName,
} from "./tools/registry";

const VALID_TOOLS = new Set<string>(ALL_READ_TOOLS);

function filterValidTools(tools: string[]): ReadToolName[] {
  return tools.filter((t): t is ReadToolName => VALID_TOOLS.has(t));
}

/**
 * Demand-driven heuristic — selects minimal tools per intent.
 * Exported for unit tests.
 */
export function heuristicPlan(message: string): AgentPlan {
  const m = message.trim();

  if (/פתח|תחפש|חיפוש ל|חיפוש חדש|תפתח לי חיפוש/i.test(m)) {
    return {
      tools: [],
      actionIntent: "create_demand",
      referencedObjectId: null,
      goal: "create_demand_draft",
    };
  }

  if (/חדש|renew|תחדש/i.test(m)) {
    return {
      tools: ["getMyExpiringDemands"],
      actionIntent: "renew_demand",
      referencedObjectId: null,
      goal: "renew_demand",
    };
  }

  if (/סגור|סיים|close/i.test(m)) {
    return {
      tools: ["getMyActiveDemands"],
      actionIntent: "close_demand",
      referencedObjectId: null,
      goal: "close_demand",
    };
  }

  if (/תעלה|תקציב|עדכן.*חיפוש|עדכן.*תקציב/i.test(m)) {
    return {
      tools: ["getMyActiveDemands"],
      actionIntent: "update_demand",
      referencedObjectId: null,
      goal: "update_demand",
    };
  }

  if (/סימנתי|נמכר|mark.*sold/i.test(m)) {
    return {
      tools: ["getMyInventoryRequiringAttention"],
      actionIntent: "mark_sold",
      referencedObjectId: null,
      goal: "mark_vehicle_sold",
    };
  }

  // Simple count — 1 cheap tool only
  if (/כמה חיפוש|חיפושים פעילים/i.test(m) && !/פג|פוג|expir/i.test(m)) {
    return {
      tools: ["getMyExchangeState"],
      actionIntent: "read",
      referencedObjectId: null,
      goal: "count_active_demands",
    };
  }

  // List my searches
  if (/החיפושים שלי|מה אני מחפש/i.test(m)) {
    return {
      tools: ["getMyActiveDemands"],
      actionIntent: "read",
      referencedObjectId: null,
      goal: "list_active_demands",
    };
  }

  // Expiring only
  if (/פג|פוג|עומד.*להסתיים|expir/i.test(m)) {
    return {
      tools: ["getMyExpiringDemands"],
      actionIntent: "read",
      referencedObjectId: null,
      goal: "list_expiring_demands",
    };
  }

  // Validations
  if (/אימות|זמינות|validation/i.test(m)) {
    return {
      tools: ["getMyPendingValidations"],
      actionIntent: "read",
      referencedObjectId: null,
      goal: "list_pending_validations",
    };
  }

  // Matches
  if (/התאמ|match/i.test(m)) {
    return {
      tools: ["getMyAuthorizedMatches"],
      actionIntent: "read",
      referencedObjectId: null,
      goal: "list_matches",
    };
  }

  // Commercial
  if (/חיבור|מסחרי|commercial|reveal/i.test(m)) {
    return {
      tools: ["getMyCommercialStatus"],
      actionIntent: "read",
      referencedObjectId: null,
      goal: "commercial_status",
    };
  }

  // Inventory attention
  if (/מלאי|רכב|inventory|stale/i.test(m)) {
    return {
      tools: ["getMyInventoryRequiringAttention"],
      actionIntent: "read",
      referencedObjectId: null,
      goal: "inventory_attention",
    };
  }

  // Broad prioritization — fan-out justified here only
  if (
    /מה כדאי|מה לעשות|סדר פעולות|תעשה לי סדר|מה מחכה|מה צריך לטפל/i.test(m)
  ) {
    return {
      tools: [
        "getMyExchangeState",
        "getMyExpiringDemands",
        "getMyPendingValidations",
        "getMyAuthorizedMatches",
        "getMyInventoryRequiringAttention",
      ],
      actionIntent: "read",
      referencedObjectId: null,
      goal: "prioritize_actions",
    };
  }

  if (/עזרה|help/i.test(m)) {
    return {
      tools: [],
      actionIntent: "help",
      referencedObjectId: null,
      goal: "help",
    };
  }

  // Unknown — single cheap tool, not fan-out
  return {
    tools: ["getMyExchangeState"],
    actionIntent: "read",
    referencedObjectId: null,
    goal: "general_inquiry",
  };
}

export async function planAgentTurn(
  message: string,
  userId: string
): Promise<{
  plan: AgentPlan;
  plannerUsed: boolean;
  model: string | null;
  durationMs: number;
}> {
  const start = Date.now();

  if (!isOpenAIConfigured()) {
    return {
      plan: heuristicPlan(message),
      plannerUsed: false,
      model: null,
      durationMs: Date.now() - start,
    };
  }

  const toolList = ALL_READ_TOOLS.map(
    (t) => `${t}: ${TOOL_DESCRIPTIONS[t]}`
  ).join("\n");

  try {
    const { data } = await callOpenAIStructured<{
      tools: string[];
      actionIntent: AgentPlan["actionIntent"];
      referencedObjectId: string | null;
      goal: string;
    }>({
      operation: "assistant_v2_plan",
      promptVersion: "2.2",
      model: AI_MODELS.demandParser,
      systemPrompt: `${PLANNER_PROMPT}\n\nAvailable tools:\n${toolList}\n\nSelect the MINIMUM tools needed. Simple count questions need only getMyExchangeState. Broad prioritization may use multiple tools.`,
      userContent: `User message: ${message}`,
      schemaName: "agent_plan",
      schema: {
        type: "object",
        properties: {
          tools: {
            type: "array",
            items: { type: "string", enum: [...ALL_READ_TOOLS] },
          },
          actionIntent: {
            type: "string",
            enum: [
              "read",
              "create_demand",
              "renew_demand",
              "close_demand",
              "update_demand",
              "confirm_validation",
              "mark_sold",
              "help",
            ],
          },
          referencedObjectId: { type: ["string", "null"] },
          goal: { type: "string" },
        },
        required: ["tools", "actionIntent", "referencedObjectId", "goal"],
        additionalProperties: false,
      },
      userId,
    });

    const tools = filterValidTools(data.tools);
    return {
      plan: {
        tools: tools.length > 0 ? tools : heuristicPlan(message).tools,
        actionIntent: data.actionIntent,
        referencedObjectId: data.referencedObjectId,
        goal: data.goal,
      },
      plannerUsed: true,
      model: AI_MODELS.demandParser,
      durationMs: Date.now() - start,
    };
  } catch {
    return {
      plan: heuristicPlan(message),
      plannerUsed: false,
      model: AI_MODELS.demandParser,
      durationMs: Date.now() - start,
    };
  }
}

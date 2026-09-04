/**
 * Agent 4.0 — bounded OpenAI tool-calling loop.
 *
 * The model owns language understanding and conversation. REMATCHER exposes
 * authorized reads, safe conversational state tools, and a deterministic write
 * boundary. No TypeScript intent classifier sits in front of normal turns.
 */
import "server-only";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import {
  AI_MODELS,
  AI_PROMPT_VERSIONS,
  AGENT_LOOP_MAX_ROUNDS,
  AGENT_LOOP_MAX_TOOLS_PER_ROUND,
} from "@/config/product";
import {
  getOpenAIClient,
  isOpenAIConfigured,
  logAiOperation,
} from "@/services/ai/client";
import { AGENT_CONSTITUTION } from "@/services/assistant/agent-constitution";
import {
  AGENT_OPENAI_TOOLS,
  isControlTool,
  isConversationStateTool,
  isReadOpenAiTool,
  OPENAI_READ_TOOL_MAP,
} from "@/services/assistant/agent-tools";
import {
  parseActionProposalFromTool,
  type ActionProposal,
} from "@/services/assistant/action-proposal";
import type { ConversationState } from "@/services/assistant/conversation-state";
import { applyInventoryDraftFacts } from "@/services/assistant/inventory-draft-state";
import { executeToolsParallel } from "@/services/assistant/tools/read-tools";
import type { ReadToolName } from "@/services/assistant/tools/registry";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";

export type AgentLoopResult = {
  message: string;
  proposal: ActionProposal | null;
  conversation?: ConversationState;
  modelCallCount: number;
  toolRoundCount: number;
  toolsUsed: string[];
  toolDurations: Record<string, number>;
  totalTokens: number;
  latencyMs: number;
  model: string | null;
  success: boolean;
  fallbackReason: string | null;
  toolResults: Record<string, unknown>;
};

function buildSystemPrompt(params: {
  conversation?: ConversationState;
  route?: string;
  inventoryMode?: boolean;
  /** Soft page context — informational only, never forced intent */
  pageContextBlock?: string;
}): string {
  const pending = params.conversation?.pendingConfirmation;
  const pendingBlock = pending
    ? `\nPENDING CONFIRMATION (deterministic boundary):\naction=${pending.action}\nlabel=${pending.label}\nIf the user clearly confirms this same action, call confirm_pending_action. If they reject it, call cancel_pending_action. If they change the requested action or scope, propose the new mutation instead.\n`
    : "\nNo pending confirmation.\n";

  const inventoryDraft = params.conversation?.pendingInventoryDraft;
  const draftBlock = inventoryDraft
    ? `\nACTIVE CONVERSATIONAL INVENTORY DRAFT:\n${JSON.stringify({
        status: inventoryDraft.status,
        fields: inventoryDraft.fields,
      }).slice(0, 1000)}\nThis draft is conversation state, not a saved database vehicle. Resolve ordinary references from the active conversation naturally. Do not replace this local context with global inventory unless the dealer actually changes topic.\n`
    : "\nNo active inventory draft.\n";

  const searchDraft = params.conversation?.pendingSearchDraft
    ? `\nPending search draft context: ${JSON.stringify(
        params.conversation.pendingSearchDraft.confirmed
      ).slice(0, 400)}\n`
    : "";

  return `${AGENT_CONSTITUTION}

RUNTIME BINDING (not a second constitution):
- You are the single REMATCHER Agent for ONE authenticated dealer. There is no Inventory Agent / Matching Agent / Demand Agent.
- Soft page context below is informational only — never forced intent or workflow lock.
- Conversation state (including pendingInventoryDraft) is context, not a cage. Follow topic changes; keep drafts unless the dealer abandons them.
- Use authorized tools as capabilities. Do not treat tools as a menu or fixed checklist.
- For unsaved inventory discussion, update_inventory_draft records structured facts you understood. It does not write to the database.
- propose_mutation only for real domain/database actions. REMATCHER Action Gateway authorizes, confirms and executes.
- Match existence, privacy, Reveal, ownership and writes remain deterministic REMATCHER authority — never invent them.
- If the dealer asserts a fact that may contradict REMATCHER system data (for example "I have no inventory" when inventory may exist), verify with the relevant authorized read tool before agreeing. Explain the gap naturally if system data differs.
- Answer in natural concise Hebrew as a business advisor. Do not expose tool names, enums, routes, freshness codes (FRESH/STALE), B2B labels, or implementation jargon unless asked technically. Translate system signals into dealer language.

CONTEXT:
route=${params.route ?? "/"}
inventoryMode=${Boolean(params.inventoryMode)}
${params.pageContextBlock ? `${params.pageContextBlock}\n` : ""}${pendingBlock}${draftBlock}${searchDraft}`;
}

function historyMessages(
  conversation?: ConversationState
): ChatCompletionMessageParam[] {
  return (conversation?.recentTurns ?? []).slice(-10).map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));
}

function truncateToolResult(value: unknown): string {
  const raw = JSON.stringify(value ?? null);
  return raw.length <= 6000 ? raw : `${raw.slice(0, 6000)}…[truncated]`;
}

function parseToolArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function runAgentToolLoop(params: {
  dealerId: string;
  userId: string;
  message: string;
  conversation?: ConversationState;
  route?: string;
  inventoryMode?: boolean;
  pageContextBlock?: string;
}): Promise<AgentLoopResult> {
  const started = Date.now();
  const toolsUsed: string[] = [];
  const toolDurations: Record<string, number> = {};
  const toolResults: Record<string, unknown> = {};
  let workingConversation = params.conversation;
  let modelCallCount = 0;
  let toolRoundCount = 0;
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let cachedPromptTokens = 0;
  let proposal: ActionProposal | null = null;

  const addUsage = (usage: any) => {
    if (!usage) return;
    totalTokens += usage.total_tokens ?? 0;
    promptTokens += usage.prompt_tokens ?? 0;
    completionTokens += usage.completion_tokens ?? 0;
    cachedPromptTokens += usage.prompt_tokens_details?.cached_tokens ?? 0;
  };

  const usageSnapshot = (
    finished: string,
    extra: Record<string, unknown> = {}
  ) => ({
    agentVersion: AGENT_VERSION,
    modelCallCount,
    toolRoundCount,
    toolsUsed,
    totalTokens,
    promptTokens,
    completionTokens,
    cachedPromptTokens,
    uncachedPromptTokens: Math.max(0, promptTokens - cachedPromptTokens),
    finished,
    ...extra,
  });

  const baseResult = () => ({
    conversation: workingConversation,
    modelCallCount,
    toolRoundCount,
    toolsUsed,
    toolDurations,
    totalTokens,
    latencyMs: Date.now() - started,
    toolResults,
  });

  if (!isOpenAIConfigured()) {
    return {
      message:
        "אני לא מצליח כרגע להתחבר למנוע השיחה. אפשר לנסות שוב עוד רגע.",
      proposal: null,
      model: null,
      success: false,
      fallbackReason: "openai_not_configured",
      ...baseResult(),
    };
  }

  const openai = getOpenAIClient();
  const model = AI_MODELS.agentLoop;
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        conversation: workingConversation,
        route: params.route,
        inventoryMode: params.inventoryMode,
        pageContextBlock: params.pageContextBlock,
      }),
    },
    ...historyMessages(workingConversation),
    { role: "user", content: params.message },
  ];

  try {
    for (let round = 0; round < AGENT_LOOP_MAX_ROUNDS; round++) {
      modelCallCount += 1;
      const completion = await openai.chat.completions.create({
        model,
        messages,
        tools: AGENT_OPENAI_TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
      });
      addUsage(completion.usage);

      const choice = completion.choices[0]?.message;
      if (!choice) throw new Error("Empty agent loop response");
      const toolCalls = choice.tool_calls ?? [];

      if (!toolCalls.length) {
        const text = (choice.content ?? "").trim();
        await logAiOperation({
          operation: "agent_loop",
          model,
          promptVersion: AI_PROMPT_VERSIONS.agentLoop,
          success: true,
          latencyMs: Date.now() - started,
          userId: params.userId,
          usageJson: usageSnapshot("final_text"),
        });
        return {
          message: text || "לא הצלחתי לנסח תשובה מועילה כרגע.",
          proposal,
          model,
          success: true,
          fallbackReason: null,
          ...baseResult(),
        };
      }

      toolRoundCount += 1;
      messages.push({
        role: "assistant",
        content: choice.content ?? null,
        tool_calls: toolCalls,
      });

      const limited = toolCalls.slice(0, AGENT_LOOP_MAX_TOOLS_PER_ROUND);
      const overflow = toolCalls.slice(AGENT_LOOP_MAX_TOOLS_PER_ROUND);
      for (const call of overflow) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            error: "tool_limit_per_round",
            note: "Not executed. Use existing results or request fewer capabilities.",
          }),
        });
      }

      const readBatch: Array<{
        call: ChatCompletionMessageToolCall;
        internal: ReadToolName;
      }> = [];

      for (const call of limited) {
        const name = call.function.name;
        toolsUsed.push(name);

        if (isConversationStateTool(name)) {
          const args = parseToolArgs(call.function.arguments);
          const facts =
            args.facts && typeof args.facts === "object"
              ? (args.facts as Record<string, unknown>)
              : {};
          const updated = applyInventoryDraftFacts({
            conversation: workingConversation,
            facts,
            sourceText: params.message,
          });
          workingConversation = updated.conversation;
          const result = {
            ok: true,
            acceptedFields: updated.acceptedFields,
            draft: updated.snapshot,
            note:
              "Conversation state updated only. Nothing was written to the database.",
          };
          toolResults.update_inventory_draft = result;
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
          continue;
        }

        if (isControlTool(name)) {
          const parsed = parseActionProposalFromTool(
            name,
            call.function.arguments ?? "{}"
          );
          if (parsed) proposal = parsed;
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({
              ok: Boolean(parsed),
              queued: Boolean(parsed),
              note:
                "Handed to the deterministic REMATCHER Action Gateway. Do not invent the execution result.",
            }),
          });
          continue;
        }

        if (isReadOpenAiTool(name)) {
          readBatch.push({ call, internal: OPENAI_READ_TOOL_MAP[name]! });
          continue;
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "unknown_tool" }),
        });
      }

      if (readBatch.length) {
        const names = [...new Set(readBatch.map((item) => item.internal))];
        const { results, durations, errors } = await executeToolsParallel(
          names,
          params.dealerId
        );
        Object.assign(toolDurations, durations);
        Object.assign(toolResults, results);
        for (const item of readBatch) {
          messages.push({
            role: "tool",
            tool_call_id: item.call.id,
            content: truncateToolResult(
              errors[item.internal]
                ? { error: errors[item.internal], data: null }
                : { data: results[item.internal] }
            ),
          });
        }
      }

      if (proposal) {
        await logAiOperation({
          operation: "agent_loop",
          model,
          promptVersion: AI_PROMPT_VERSIONS.agentLoop,
          success: true,
          latencyMs: Date.now() - started,
          userId: params.userId,
          usageJson: usageSnapshot("action_proposal", {
            proposalKind: proposal.kind,
            capability: proposal.capability,
            operation: proposal.operation,
          }),
        });
        return {
          message: "",
          proposal,
          model,
          success: true,
          fallbackReason: null,
          ...baseResult(),
        };
      }
    }

    modelCallCount += 1;
    const finalCompletion = await openai.chat.completions.create({
      model,
      messages: [
        ...messages,
        {
          role: "system",
          content:
            "הגעת למגבלת סבבי הכלים. אל תקרא לכלי נוסף. ענה עכשיו לשאלה המקורית בעברית טבעית וקצרה, רק מתוך ההקשר ותוצאות הכלים שכבר קיימים. אל תמציא מידע ואל תבקש מהמשתמש לנסח מחדש רק בגלל מגבלת הכלים.",
        },
      ],
      temperature: 0.2,
    });
    addUsage(finalCompletion.usage);
    const finalText = (
      finalCompletion.choices[0]?.message?.content ?? ""
    ).trim();

    await logAiOperation({
      operation: "agent_loop",
      model,
      promptVersion: AI_PROMPT_VERSIONS.agentLoop,
      success: true,
      latencyMs: Date.now() - started,
      userId: params.userId,
      usageJson: usageSnapshot("forced_final_after_max_tool_rounds"),
    });

    return {
      message:
        finalText ||
        "בדקתי את המידע הזמין, אבל אין לי בסיס מספיק לתשובה מדויקת בלי להמציא.",
      proposal: null,
      model,
      success: true,
      fallbackReason: finalText ? null : "max_rounds_empty_final",
      ...baseResult(),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "unknown";
    await logAiOperation({
      operation: "agent_loop",
      model,
      promptVersion: AI_PROMPT_VERSIONS.agentLoop,
      success: false,
      latencyMs: Date.now() - started,
      userId: params.userId,
      errorMessage: errorMessage.slice(0, 300),
      usageJson: usageSnapshot("error"),
    });
    return {
      message:
        "לא הצלחתי להשלים את הבדיקה כרגע. אפשר לנסות שוב עוד רגע — לא בוצעה שום פעולה.",
      proposal: null,
      model,
      success: false,
      fallbackReason: "agent_loop_error",
      ...baseResult(),
    };
  }
}

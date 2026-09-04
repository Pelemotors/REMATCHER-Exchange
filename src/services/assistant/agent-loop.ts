/**
 * Agent 4.0 — bounded OpenAI tool-calling loop for READ/advice.
 * Tool results return to the model. Writes exit via ActionProposal to Action Gateway.
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
import { getOpenAIClient, isOpenAIConfigured, logAiOperation } from "@/services/ai/client";
import { AGENT_CONSTITUTION } from "@/services/assistant/agent-constitution";
import { AGENT_OPENAI_TOOLS, isControlTool, isReadOpenAiTool, OPENAI_READ_TOOL_MAP } from "@/services/assistant/agent-tools";
import { parseActionProposalFromTool, type ActionProposal } from "@/services/assistant/action-proposal";
import type { ConversationState } from "@/services/assistant/conversation-state";
import { executeToolsParallel } from "@/services/assistant/tools/read-tools";
import type { ReadToolName } from "@/services/assistant/tools/registry";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";

export type AgentLoopResult = {
  message: string; proposal: ActionProposal | null; modelCallCount: number; toolRoundCount: number;
  toolsUsed: string[]; toolDurations: Record<string, number>; totalTokens: number; latencyMs: number;
  model: string | null; success: boolean; fallbackReason: string | null; toolResults: Record<string, unknown>;
};

function buildSystemPrompt(params: { conversation?: ConversationState; route?: string; inventoryMode?: boolean }): string {
  const pending = params.conversation?.pendingConfirmation;
  const pendingBlock = pending
    ? `\nPENDING CONFIRMATION (must respect):\naction=${pending.action}\nlabel=${pending.label}\ntargetCount=${Array.isArray(pending.payload.demandIds) ? (pending.payload.demandIds as string[]).length : pending.payload.demandId ? 1 : "unknown"}\nscope=${pending.payload.scope ?? "n/a"}\nIf the user affirms THIS pending action → call confirm_pending_action.\nIf they reject → cancel_pending_action.\nIf they change scope → propose_mutation with the NEW scope (do not confirm the old one).\n`
    : "\nNo pending confirmation.\n";
  const draft = params.conversation?.pendingInventoryDraft ? `\nPending inventory draft in progress (context only): ${JSON.stringify(params.conversation.pendingInventoryDraft.fields).slice(0, 400)}\n` : "";
  const searchDraft = params.conversation?.pendingSearchDraft ? `\nPending search draft (context): ${JSON.stringify(params.conversation.pendingSearchDraft.confirmed).slice(0, 300)}\n` : "";
  return `${AGENT_CONSTITUTION}

You are the REMATCHER Exchange Assistant runtime 4.0 — a tool-using conversational agent for ONE authenticated dealer.

HOW YOU WORK:
- For questions, advice, analysis, prioritization: call only the authorized READ tools actually needed, inspect results, and answer in Hebrew.
- You decide which tools to call. Do not wait for TypeScript to map the question.
- Novel analytical questions are expected. Combine domains when useful, but do not re-read data already established in the recent conversation unless the user says it changed or the answer requires fresh verification.
- Never invent counts, matches, inventory, identities, permissions, causality, or product rules. A missing field may be commercially worth completing, but never claim it harms matching unless a verified rule/result says so.
- Never browse network inventory. Tools only return THIS dealer's authorized data.
- Match truth is deterministic and stored. get_my_matches returns authorized stored matches only; you never decide match=true.
- For WRITE intents call propose_mutation. Do NOT pretend the write already happened.
- After tool results arrive, reason over them and revise when new facts contradict earlier advice.
- Speak like a sharp dealer-side commercial partner, not an analyst report. Default to 1–3 short paragraphs. Do not routinely label sections עובדות/מסקנה/המלצה.
- Translate internal values/statuses into natural Hebrew. Never expose internal enum names such as FRESH, STALE, B2B, tool names, route names, prompt versions or implementation terminology unless the user explicitly asks technically.
- Give the best next move directly. Do not end every answer with אם תרצה or a menu of things you can do.
- Answer the question first.

CONTEXT:
route=${params.route ?? "/"}
inventoryMode=${Boolean(params.inventoryMode)}
${pendingBlock}${draft}${searchDraft}`;
}

function historyMessages(conversation?: ConversationState): ChatCompletionMessageParam[] {
  return (conversation?.recentTurns ?? []).slice(-10).map((t) => ({ role: t.role, content: t.text }));
}
function truncateToolResult(value: unknown): string { const raw = JSON.stringify(value ?? null); return raw.length <= 6000 ? raw : raw.slice(0, 6000) + "…[truncated]"; }

export async function runAgentToolLoop(params: { dealerId: string; userId: string; message: string; conversation?: ConversationState; route?: string; inventoryMode?: boolean }): Promise<AgentLoopResult> {
  const started = Date.now(); const toolsUsed: string[] = []; const toolDurations: Record<string, number> = {}; const toolResults: Record<string, unknown> = {};
  let modelCallCount = 0, toolRoundCount = 0, totalTokens = 0, promptTokens = 0, completionTokens = 0, cachedPromptTokens = 0;
  let proposal: ActionProposal | null = null;
  const addUsage = (usage: any) => { if (!usage) return; totalTokens += usage.total_tokens ?? 0; promptTokens += usage.prompt_tokens ?? 0; completionTokens += usage.completion_tokens ?? 0; cachedPromptTokens += usage.prompt_tokens_details?.cached_tokens ?? 0; };
  const usageSnapshot = (finished: string, extra: Record<string, unknown> = {}) => ({ agentVersion: AGENT_VERSION, modelCallCount, toolRoundCount, toolsUsed, totalTokens, promptTokens, completionTokens, cachedPromptTokens, uncachedPromptTokens: Math.max(0, promptTokens - cachedPromptTokens), finished, ...extra });

  if (!isOpenAIConfigured()) return { message: "אני לא מצליח כרגע להתחבר למנוע השיחה. אפשר לנסות שוב, או לעבור למסכי מלאי / חיפושים / התאמות.", proposal: null, modelCallCount: 0, toolRoundCount: 0, toolsUsed: [], toolDurations: {}, totalTokens: 0, latencyMs: Date.now() - started, model: null, success: false, fallbackReason: "openai_not_configured", toolResults: {} };
  const openai = getOpenAIClient(); const model = AI_MODELS.agentLoop;
  const messages: ChatCompletionMessageParam[] = [{ role: "system", content: buildSystemPrompt({ conversation: params.conversation, route: params.route, inventoryMode: params.inventoryMode }) }, ...historyMessages(params.conversation), { role: "user", content: params.message }];

  try {
    for (let round = 0; round < AGENT_LOOP_MAX_ROUNDS; round++) {
      modelCallCount += 1;
      const completion = await openai.chat.completions.create({ model, messages, tools: AGENT_OPENAI_TOOLS, tool_choice: "auto", temperature: 0.2 });
      addUsage(completion.usage);
      const choice = completion.choices[0]?.message; if (!choice) throw new Error("Empty agent loop response");
      const toolCalls = choice.tool_calls ?? [];
      if (!toolCalls.length) {
        const text = (choice.content ?? "").trim();
        await logAiOperation({ operation: "agent_loop", model, promptVersion: AI_PROMPT_VERSIONS.agentLoop, success: true, latencyMs: Date.now() - started, userId: params.userId, usageJson: usageSnapshot("final_text") });
        return { message: text || "לא בטוח שהבנתי — נסח לי את זה שוב בקצרה.", proposal, modelCallCount, toolRoundCount, toolsUsed, toolDurations, totalTokens, latencyMs: Date.now() - started, model, success: true, fallbackReason: null, toolResults };
      }
      toolRoundCount += 1; messages.push({ role: "assistant", content: choice.content ?? null, tool_calls: toolCalls });
      const limited = toolCalls.slice(0, AGENT_LOOP_MAX_TOOLS_PER_ROUND); const overflow = toolCalls.slice(AGENT_LOOP_MAX_TOOLS_PER_ROUND);
      for (const call of overflow) messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "tool_limit_per_round", note: "Not executed because the per-round read limit was reached. Use existing authorized results, or request later only if still necessary." }) });
      const readBatch: Array<{ call: ChatCompletionMessageToolCall; internal: ReadToolName }> = [];
      for (const call of limited) {
        const name = call.function.name; toolsUsed.push(name);
        if (isControlTool(name)) { const parsed = parseActionProposalFromTool(name, call.function.arguments ?? "{}"); if (parsed) proposal = parsed; messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, queued: true, note: "Handed to REMATCHER Action Gateway. Do not invent execution result.", proposal: parsed }) }); continue; }
        if (isReadOpenAiTool(name)) { readBatch.push({ call, internal: OPENAI_READ_TOOL_MAP[name]! }); continue; }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "unknown_tool", note: "Tool not in approved registry" }) });
      }
      if (readBatch.length) {
        const names = [...new Set(readBatch.map((r) => r.internal))]; const { results, durations, errors } = await executeToolsParallel(names, params.dealerId); Object.assign(toolDurations, durations); Object.assign(toolResults, results);
        for (const item of readBatch) messages.push({ role: "tool", tool_call_id: item.call.id, content: truncateToolResult(errors[item.internal] ? { error: errors[item.internal], data: null } : { data: results[item.internal] }) });
      }
      if (proposal) {
        await logAiOperation({ operation: "agent_loop", model, promptVersion: AI_PROMPT_VERSIONS.agentLoop, success: true, latencyMs: Date.now() - started, userId: params.userId, usageJson: usageSnapshot("action_proposal", { proposalKind: proposal.kind, capability: proposal.capability, operation: proposal.operation }) });
        return { message: "", proposal, modelCallCount, toolRoundCount, toolsUsed, toolDurations, totalTokens, latencyMs: Date.now() - started, model, success: true, fallbackReason: null, toolResults };
      }
    }
    modelCallCount += 1;
    const finalCompletion = await openai.chat.completions.create({ model, messages: [...messages, { role: "system", content: "הגעת למגבלת סבבי הכלים לתור הזה. אל תבקש כלי נוסף ואל תבקש מהמשתמש לנסח מחדש. ענה עכשיו לשאלה המקורית בעברית טבעית וקצרה, כמו שותף מסחרי לסוחר, ורק מתוך המידע המורשה שכבר נאסף. אל תציג דוח, שמות סטטוסים פנימיים או כותרות עובדה/מסקנה/המלצה. אם המידע חלקי, אמור בקצרה מה כן ניתן להסיק בלי להמציא." }], temperature: 0.2 });
    addUsage(finalCompletion.usage); const finalText = (finalCompletion.choices[0]?.message?.content ?? "").trim();
    await logAiOperation({ operation: "agent_loop", model, promptVersion: AI_PROMPT_VERSIONS.agentLoop, success: true, latencyMs: Date.now() - started, userId: params.userId, usageJson: usageSnapshot("forced_final_after_max_tool_rounds") });
    return { message: finalText || "בדקתי את המידע הזמין, אבל אין לי כרגע בסיס מספיק להמלצה מדויקת בלי להמציא.", proposal: null, modelCallCount, toolRoundCount, toolsUsed, toolDurations, totalTokens, latencyMs: Date.now() - started, model, success: true, fallbackReason: finalText ? null : "max_rounds_empty_final", toolResults };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "unknown";
    await logAiOperation({ operation: "agent_loop", model, promptVersion: AI_PROMPT_VERSIONS.agentLoop, success: false, latencyMs: Date.now() - started, userId: params.userId, errorMessage: errMsg.slice(0, 300), usageJson: usageSnapshot("error") });
    return { message: "לא הצלחתי להשלים את הבדיקה כרגע. אפשר לנסות שוב עוד רגע — לא בוצעה שום פעולה.", proposal: null, modelCallCount, toolRoundCount, toolsUsed, toolDurations, totalTokens, latencyMs: Date.now() - started, model, success: false, fallbackReason: "agent_loop_error", toolResults };
  }
}
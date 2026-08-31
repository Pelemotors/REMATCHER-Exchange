import "server-only";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function logAiOperation(params: {
  operation: string;
  model?: string;
  promptVersion?: string;
  success: boolean;
  latencyMs?: number;
  usageJson?: object;
  errorMessage?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
}) {
  try {
    await prisma.aiOperationLog.create({
      data: {
        operation: params.operation,
        model: params.model,
        promptVersion: params.promptVersion,
        success: params.success,
        latencyMs: params.latencyMs,
        usageJson: params.usageJson ?? undefined,
        errorMessage: params.errorMessage,
        entityType: params.entityType,
        entityId: params.entityId,
        userId: params.userId,
      },
    });
  } catch {
    // non-blocking
  }
}

export async function callOpenAIStructured<T>(params: {
  operation: string;
  promptVersion: string;
  model: string;
  systemPrompt: string;
  userContent: string;
  schemaName: string;
  schema: Record<string, unknown>;
  userId?: string;
  entityType?: string;
  entityId?: string;
}): Promise<{ data: T; usage?: object }> {
  const start = Date.now();
  const openai = getOpenAIClient();

  try {
    const response = await openai.chat.completions.create({
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: params.schemaName,
          strict: true,
          schema: params.schema,
        },
      },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const data = JSON.parse(content) as T;
    const latencyMs = Date.now() - start;
    const usage = response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined;

    await logAiOperation({
      operation: params.operation,
      model: params.model,
      promptVersion: params.promptVersion,
      success: true,
      latencyMs,
      usageJson: usage,
      userId: params.userId,
      entityType: params.entityType,
      entityId: params.entityId,
    });

    return { data, usage };
  } catch (error) {
    await logAiOperation({
      operation: params.operation,
      model: params.model,
      promptVersion: params.promptVersion,
      success: false,
      latencyMs: Date.now() - start,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      userId: params.userId,
      entityType: params.entityType,
      entityId: params.entityId,
    });
    throw error;
  }
}

export { AI_MODELS, AI_PROMPT_VERSIONS };

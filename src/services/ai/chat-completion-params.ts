/**
 * Pure OpenAI Chat Completions request sanitizer.
 * gpt-5 / o-series reject `max_tokens` (HTTP 400: use max_completion_tokens).
 * gpt-4o* still uses `max_tokens`.
 * No secrets, no I/O — safe to unit-test.
 */

export function modelUsesMaxCompletionTokens(model: string): boolean {
  return /^(gpt-5|o[1-9]|o3|o4)/i.test(model.trim());
}

export type ChatTokenLimitParams = {
  model?: string;
  max_tokens?: number | null;
  max_completion_tokens?: number | null;
  max_output_tokens?: number | null;
};

export function chatCompletionLength(
  model: string,
  n: number
): { max_tokens: number } | { max_completion_tokens: number } {
  if (modelUsesMaxCompletionTokens(model)) {
    return { max_completion_tokens: n };
  }
  return { max_tokens: n };
}

/**
 * Rewrite token-limit fields to the contract the model actually accepts.
 * Leaves every other request option intact (messages, tools, temperature, …).
 */
export function sanitizeChatCompletionParams<T extends ChatTokenLimitParams>(
  params: T
): Omit<T, "max_tokens" | "max_completion_tokens" | "max_output_tokens"> & {
  max_tokens?: number;
  max_completion_tokens?: number;
} {
  const model = String(params.model ?? "");
  const limit =
    typeof params.max_completion_tokens === "number"
      ? params.max_completion_tokens
      : typeof params.max_tokens === "number"
        ? params.max_tokens
        : typeof params.max_output_tokens === "number"
          ? params.max_output_tokens
          : undefined;

  const next = { ...params } as T & ChatTokenLimitParams;
  delete next.max_tokens;
  delete next.max_completion_tokens;
  delete next.max_output_tokens;

  if (typeof limit === "number") {
    if (modelUsesMaxCompletionTokens(model)) {
      next.max_completion_tokens = limit;
    } else {
      next.max_tokens = limit;
    }
  }

  return next as Omit<T, "max_tokens" | "max_completion_tokens" | "max_output_tokens"> & {
    max_tokens?: number;
    max_completion_tokens?: number;
  };
}

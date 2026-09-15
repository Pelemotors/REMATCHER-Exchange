/**
 * Optional media understanding for Intake — used only when cheap paths insufficient.
 * Never Source of Truth vs GOV. Low confidence → hints only / NEEDS_INFO.
 */
import "server-only";
import {
  getOpenAIClient,
  isOpenAIConfigured,
  logAiOperation,
} from "@/services/ai/client";
import { AI_MODELS } from "@/config/product";

export type MediaUnderstandingHint = {
  source: "VISION";
  confidence: number;
  likelySameVehicle: boolean;
  makeHint?: string | null;
  modelHint?: string | null;
  yearHint?: number | null;
  listingTextHints?: string[];
  plateDigitsHint?: string | null;
  notes?: string | null;
};

/**
 * Analyze a small sample of images when plate/text identity is incomplete.
 * Caps to `maxImages` (default 2) for cost/latency.
 */
export async function understandIntakeMediaSample(
  images: Array<{ bytes: Buffer; mimeType?: string; mediaId?: string }>,
  opts?: { maxImages?: number; accompanyingText?: string }
): Promise<MediaUnderstandingHint | null> {
  if (!isOpenAIConfigured()) return null;
  const max = Math.min(opts?.maxImages ?? 2, images.length);
  if (max <= 0) return null;

  const sample = images.slice(0, max);
  const start = Date.now();
  const model = AI_MODELS.agentLoop || "gpt-4o-mini";

  try {
    const openai = getOpenAIClient();
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "low" } }
    > = [
      {
        type: "text",
        text:
          "Analyze vehicle listing / WhatsApp share images. Return JSON only:\n" +
          JSON.stringify({
            likelySameVehicle: true,
            confidence: 0.0,
            makeHint: null,
            modelHint: null,
            yearHint: null,
            plateDigitsHint: null,
            listingTextHints: [],
            notes: null,
          }) +
          "\nRules: never invent plates/make/model. Use null when unsure. " +
          "likelySameVehicle=true when images appear to be one vehicle listing. " +
          (opts?.accompanyingText
            ? `Accompanying text: ${opts.accompanyingText.slice(0, 500)}`
            : ""),
      },
    ];

    for (const img of sample) {
      const mime = img.mimeType || "image/jpeg";
      if (img.bytes.length > 3_500_000) continue;
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${mime};base64,${img.bytes.toString("base64")}`,
          detail: "low",
        },
      });
    }

    if (content.length < 2) return null;

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 350,
      messages: [
        {
          role: "system",
          content:
            "You extract uncertain visual hints for a car dealer intake system. Never invent facts.",
        },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const data = JSON.parse(raw) as Partial<MediaUnderstandingHint> & {
      confidence?: number;
      likelySameVehicle?: boolean;
    };
    const confidence =
      typeof data.confidence === "number" ? Math.min(1, Math.max(0, data.confidence)) : 0.4;

    await logAiOperation({
      operation: "intake.media_vision",
      model,
      success: true,
      latencyMs: Date.now() - start,
      usageJson: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
          }
        : undefined,
    });

    if (confidence < 0.35) return null;

    return {
      source: "VISION",
      confidence,
      likelySameVehicle: data.likelySameVehicle !== false,
      makeHint: data.makeHint ?? null,
      modelHint: data.modelHint ?? null,
      yearHint:
        typeof data.yearHint === "number" && data.yearHint > 1990 && data.yearHint < 2100
          ? data.yearHint
          : null,
      listingTextHints: Array.isArray(data.listingTextHints)
        ? data.listingTextHints.map(String).slice(0, 8)
        : [],
      plateDigitsHint: data.plateDigitsHint
        ? String(data.plateDigitsHint).replace(/\D/g, "")
        : null,
      notes: data.notes ? String(data.notes).slice(0, 240) : null,
    };
  } catch (error) {
    await logAiOperation({
      operation: "intake.media_vision",
      model,
      success: false,
      latencyMs: Date.now() - start,
      errorMessage: error instanceof Error ? error.message : "vision_failed",
    });
    return null;
  }
}

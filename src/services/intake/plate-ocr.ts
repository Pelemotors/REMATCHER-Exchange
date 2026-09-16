/**
 * Plate OCR / vision extraction for Intake.
 * GOV remains canonical after plate normalize + lookup — OCR never invents plates.
 *
 * Pipeline:
 * 1) Optional fixture/text override (tests)
 * 2) Deterministic yellow-plate crop when possible
 * 3) Narrow vision: read the visible Israeli plate → structured JSON
 * 4) Deterministic normalize + sanity in code
 * 5) null if no evidence / low confidence / disagreeing fields
 */
import "server-only";
import {
  chatCompletionLength,
  getOpenAIClient,
  isOpenAIConfigured,
  logAiOperation,
} from "@/services/ai/client";
import { AI_MODELS } from "@/config/product";
import { cropIsraeliYellowPlate } from "@/services/intake/israeli-plate-crop";
import { prepareImageForVision } from "@/services/intake/vision-image";
import {
  plateTokensFromVisibleText,
  resolveStructuredPlate,
  type AcceptedPlate,
} from "@/services/intake/plate-ocr-result";

export type PlateOcrHint = {
  value: string;
  confidence: number;
  source: "OCR";
  rawText?: string;
};

export function parsePlateCandidatesFromOcrText(
  text: string
): Array<{ value: string; confidence: number }> {
  return plateTokensFromVisibleText(text).map((value) => ({
    value,
    confidence: 0.72,
  }));
}

function toHint(accepted: AcceptedPlate): PlateOcrHint {
  return {
    value: accepted.value,
    confidence: accepted.confidence,
    source: "OCR",
    rawText: accepted.rawText,
  };
}

async function requestPlateJson(
  model: string,
  mime: string,
  imageBytes: Buffer
): Promise<{
  content: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}> {
  const openai = getOpenAIClient();
  const b64 = imageBytes.toString("base64");
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    ...chatCompletionLength(model, 120),
    messages: [
      {
        role: "system",
        content:
          "You read Israeli vehicle registration plates from photos. " +
          "Return JSON only: {\"plateNumber\":string|null,\"visibleText\":string|null,\"confidence\":number}. " +
          "plateNumber = digits as seen (punctuation allowed). visibleText = the plate text as painted. " +
          "confidence 0–1. If the plate is not clearly readable, plateNumber=null and confidence<=0.4. " +
          "Never guess or invent missing digits. Ignore prices, phone numbers, dashboards, and UI text. " +
          "Only read a metal plate mounted on a vehicle, not numbers printed in an app or advertisement.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Read the Israeli vehicle registration plate visible in this image.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${b64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });
  return {
    content: completion.choices[0]?.message?.content ?? "",
    usage: completion.usage,
  };
}

function acceptFromContent(content: string): PlateOcrHint | null {
  let parsed: {
    plateNumber?: string | null;
    visibleText?: string | null;
    confidence?: number | null;
    plates?: Array<{ digits?: string; confidence?: number }>;
  } = {};
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    return null;
  }
  const accepted = resolveStructuredPlate({
    plateNumber: parsed.plateNumber ?? parsed.plates?.[0]?.digits ?? null,
    visibleText: parsed.visibleText ?? null,
    confidence:
      parsed.confidence ?? parsed.plates?.[0]?.confidence ?? null,
  });
  return accepted ? toHint(accepted) : null;
}

/**
 * Extract a plate from image bytes.
 * Set INTAKE_OCR_TEXT_OVERRIDE for deterministic fixture tests (no network).
 */
export async function extractPlateFromImageBytes(
  bytes: Buffer,
  opts?: { mimeType?: string; mediaId?: string }
): Promise<PlateOcrHint | null> {
  const override = process.env.INTAKE_OCR_TEXT_OVERRIDE?.trim();
  if (override) {
    const accepted = resolveStructuredPlate({
      plateNumber: override,
      visibleText: override,
      confidence: 1,
    });
    return accepted ? toHint(accepted) : null;
  }

  if (!bytes?.length) return null;
  if (!isOpenAIConfigured()) return null;

  const prepared = await prepareImageForVision(bytes, opts?.mimeType);
  if (!prepared) return null;
  const mime = prepared.mimeType;
  if (!mime.startsWith("image/")) return null;

  const start = Date.now();
  const model = AI_MODELS.plateOcr;
  const crop = await cropIsraeliYellowPlate(prepared.bytes);
  const attempts: Array<{ bytes: Buffer; mimeType: string }> = crop
    ? [
        { bytes: crop.bytes, mimeType: crop.mimeType },
        { bytes: prepared.bytes, mimeType: mime },
      ]
    : [{ bytes: prepared.bytes, mimeType: mime }];

  try {
    let hint: PlateOcrHint | null = null;
    let lastUsage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
    let invalidJson = false;

    for (const attempt of attempts) {
      const { content, usage } = await requestPlateJson(
        model,
        attempt.mimeType,
        attempt.bytes
      );
      lastUsage = usage;
      if (!content) continue;
      const parsed = acceptFromContent(content);
      if (parsed) {
        hint = parsed;
        break;
      }
      if (content && !parsed) {
        try {
          JSON.parse(content);
        } catch {
          invalidJson = true;
        }
      }
    }

    await logAiOperation({
      operation: "intake.plate_ocr",
      model,
      success: Boolean(hint),
      latencyMs: Date.now() - start,
      usageJson: lastUsage
        ? {
            promptTokens: lastUsage.prompt_tokens,
            completionTokens: lastUsage.completion_tokens,
          }
        : undefined,
      errorMessage: hint ? undefined : invalidJson ? "invalid_json" : undefined,
      entityType: "intake_media",
      entityId: opts?.mediaId,
    });
    return hint;
  } catch (error) {
    await logAiOperation({
      operation: "intake.plate_ocr",
      model,
      success: false,
      latencyMs: Date.now() - start,
      errorMessage: error instanceof Error ? error.message : "ocr_failed",
      entityType: "intake_media",
      entityId: opts?.mediaId,
    });
    return null;
  }
}

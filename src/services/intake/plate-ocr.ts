/**
 * Plate OCR / vision extraction for Intake.
 * GOV remains canonical after plate normalize + lookup — OCR never invents plates.
 *
 * Pipeline:
 * 1) Optional fixture/text override (tests)
 * 2) OpenAI vision when configured
 * 3) null if no evidence / low confidence
 */
import "server-only";
import {
  getOpenAIClient,
  isOpenAIConfigured,
  logAiOperation,
} from "@/services/ai/client";
import { AI_MODELS } from "@/config/product";
import { isValidIsraeliPlate } from "@/services/identity/gov-vehicle";
import { normalizePlate } from "@/services/intake/status";

export type PlateOcrHint = {
  value: string;
  confidence: number;
  source: "OCR";
  rawText?: string;
};

const PLATE_TOKEN_RE =
  /\b(\d{2,3}[-\s]?\d{2,3}[-\s]?\d{2,3}|\d{7,8})\b/g;

/** Deterministic parse of OCR/vision free text into plate candidates. */
export function parsePlateCandidatesFromOcrText(
  text: string
): Array<{ value: string; confidence: number }> {
  if (!text?.trim()) return [];
  const seen = new Set<string>();
  const out: Array<{ value: string; confidence: number }> = [];
  for (const m of text.matchAll(PLATE_TOKEN_RE)) {
    const digits = m[1]!.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 8) continue;
    if (seen.has(digits)) continue;
    if (!isValidIsraeliPlate(digits) && digits.length !== 7 && digits.length !== 8) {
      continue;
    }
    seen.add(digits);
    const conf =
      isValidIsraeliPlate(digits) || digits.length === 7 || digits.length === 8
        ? 0.72
        : 0.45;
    out.push({ value: digits, confidence: conf });
  }
  return out;
}

function pickBestPlate(
  candidates: Array<{ value: string; confidence: number }>,
  rawText?: string
): PlateOcrHint | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0]!;
  if (best.confidence < 0.5) return null;
  const normalized = normalizePlate(best.value);
  if (!normalized) return null;
  // Soft validate — invalid format → null (never invent)
  if (!isValidIsraeliPlate(normalized) && normalized.length !== 7 && normalized.length !== 8) {
    return null;
  }
  return {
    value: normalized,
    confidence: best.confidence,
    source: "OCR",
    rawText,
  };
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
    return pickBestPlate(parsePlateCandidatesFromOcrText(override), override);
  }

  if (!bytes?.length) return null;
  if (!isOpenAIConfigured()) return null;

  const mime = opts?.mimeType || guessMime(bytes);
  if (!mime.startsWith("image/")) return null;

  // Skip huge payloads — resize responsibility is caller's; hard cap ~4MB
  if (bytes.length > 4_000_000) return null;

  const start = Date.now();
  try {
    const openai = getOpenAIClient();
    const b64 = bytes.toString("base64");
    const model = AI_MODELS.agentLoop || "gpt-4o-mini";
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "Extract Israeli vehicle license plate numbers visible in the image. " +
            "Return JSON only: {\"plates\":[{\"digits\":\"1234567\",\"confidence\":0.0}],\"visibleText\":\"...\"}. " +
            "digits = digits only (7–8). If none visible, plates=[]. Never invent plates.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Find license plates in this vehicle/document/screenshot image.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${b64}`,
                detail: "low",
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    let parsed: {
      plates?: Array<{ digits?: string; confidence?: number }>;
      visibleText?: string;
    } = {};
    try {
      parsed = JSON.parse(content) as typeof parsed;
    } catch {
      await logAiOperation({
        operation: "intake.plate_ocr",
        model,
        success: false,
        latencyMs: Date.now() - start,
        errorMessage: "invalid_json",
        entityType: "intake_media",
        entityId: opts?.mediaId,
      });
      return null;
    }

    const fromModel = (parsed.plates ?? [])
      .map((p) => {
        const digits = String(p.digits ?? "").replace(/\D/g, "");
        const confidence =
          typeof p.confidence === "number" && p.confidence >= 0 && p.confidence <= 1
            ? p.confidence
            : 0.55;
        return { value: digits, confidence };
      })
      .filter((p) => p.value.length >= 7 && p.value.length <= 8);

    const fromVisible = parsePlateCandidatesFromOcrText(parsed.visibleText ?? "");
    const merged = [...fromModel];
    for (const c of fromVisible) {
      if (!merged.some((m) => m.value === c.value)) merged.push(c);
    }

    const hint = pickBestPlate(merged, parsed.visibleText);
    await logAiOperation({
      operation: "intake.plate_ocr",
      model,
      success: Boolean(hint),
      latencyMs: Date.now() - start,
      usageJson: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
          }
        : undefined,
      entityType: "intake_media",
      entityId: opts?.mediaId,
    });
    return hint;
  } catch (error) {
    await logAiOperation({
      operation: "intake.plate_ocr",
      success: false,
      latencyMs: Date.now() - start,
      errorMessage: error instanceof Error ? error.message : "ocr_failed",
      entityType: "intake_media",
      entityId: opts?.mediaId,
    });
    return null;
  }
}

function guessMime(bytes: Buffer): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

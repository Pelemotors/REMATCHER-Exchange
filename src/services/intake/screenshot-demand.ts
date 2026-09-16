import "server-only";
import {
  chatCompletionLength,
  getOpenAIClient,
  isOpenAIConfigured,
  logAiOperation,
} from "@/services/ai/client";
import { AI_MODELS } from "@/config/product";
import { prepareImageForVision } from "@/services/intake/vision-image";
import type { IntakeInputKind } from "@/services/intake/input-kind";

export type ConversationExtract = {
  text: string;
  kind: IntakeInputKind;
  confidence: number;
};

/**
 * Read WhatsApp-like screenshot / listing image into plain text.
 * Never invent customer identity. Prefer quoted bubbles over chrome UI.
 */
export async function extractTextFromIntakeImage(input: {
  bytes: Buffer;
  mimeType?: string;
  mediaId?: string;
}): Promise<ConversationExtract | null> {
  if (!isOpenAIConfigured()) return null;
  const prepared = await prepareImageForVision(input.bytes, input.mimeType);
  if (!prepared) return null;

  const start = Date.now();
  const model =
    process.env.OPENAI_INTAKE_VISION_MODEL ||
    AI_MODELS.agentLoop ||
    "gpt-5.4-mini";

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      ...chatCompletionLength(model, 400),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Classify this image and transcribe relevant text. JSON only:\n" +
                '{"kind":"CUSTOMER_CONVERSATION|VEHICLE_PHOTO|VEHICLE_LISTING|DOCUMENT|UNKNOWN","confidence":0.0,"text":""}\n' +
                "CUSTOMER_CONVERSATION = chat screenshot (WhatsApp etc).\n" +
                "VEHICLE_PHOTO = photograph of a real car.\n" +
                "VEHICLE_LISTING = marketplace ad screenshot.\n" +
                "DOCUMENT = license / registration.\n" +
                "For conversation: transcribe customer/dealer bubbles in order. Ignore UI chrome, timestamps optional.\n" +
                "Do not invent a phone number as the customer's unless the bubble clearly is the customer's contact.\n" +
                "If VEHICLE_PHOTO with no useful text, text can be empty.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${prepared.mimeType};base64,${prepared.bytes.toString("base64")}`,
                detail: "low",
              },
            },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      kind?: string;
      confidence?: number;
      text?: string;
    };
    const kind = (parsed.kind ?? "UNKNOWN") as IntakeInputKind;
    const allowed: IntakeInputKind[] = [
      "CUSTOMER_CONVERSATION",
      "VEHICLE_PHOTO",
      "VEHICLE_LISTING",
      "DOCUMENT",
      "UNKNOWN",
    ];
    await logAiOperation({
      operation: "intake.screenshot_extract",
      model,
      latencyMs: Date.now() - start,
      success: true,
      entityType: "IntakeMedia",
      entityId: input.mediaId,
    }).catch(() => undefined);
    return {
      kind: allowed.includes(kind) ? kind : "UNKNOWN",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      text: typeof parsed.text === "string" ? parsed.text.trim() : "",
    };
  } catch {
    await logAiOperation({
      operation: "intake.screenshot_extract",
      model,
      latencyMs: Date.now() - start,
      success: false,
      entityType: "IntakeMedia",
      entityId: input.mediaId,
    }).catch(() => undefined);
    return null;
  }
}

export {
  applyLaterMessageWins,
  mergeConversationSnippets,
} from "@/services/intake/conversation-text";

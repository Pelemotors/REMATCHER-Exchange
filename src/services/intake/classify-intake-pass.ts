import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { classifyInputKindHeuristic, shouldSkipVehicleOcr } from "@/services/intake/input-kind";
import {
  extractTextFromIntakeImage,
} from "@/services/intake/screenshot-demand";
import {
  mergeConversationSnippets,
  applyLaterMessageWins,
} from "@/services/intake/conversation-text";
import { parseDemand } from "@/services/ai/demand-parser";
import { summarizeDemandHe } from "@/services/intake/demand-summary";
import {
  extractCustomerHintsFromText,
  isSafePhoneForPersist,
} from "@/services/capture/customer-extract";
import { resolveMediaAbsolutePath } from "@/lib/media/storage";
import { readFile } from "node:fs/promises";
import type { IntakeInputKind } from "@/services/intake/input-kind";

export function looksLikeCustomerDemandText(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  return /מחפש|יש לי לקוח|צריך(?:\s+לקוח)?|רוצה|לאשתי|עד\s*\d+|cx-?5|ראב\s*4|קורולה|ספורטאז|טוסון|אקסטרייל|x3/i.test(
    t
  );
}

/**
 * Classify intake media, extract conversation text, skip OCR on chat screenshots.
 * Stores demandDraft on the batch when customer language is present.
 */
export async function classifyIntakeBatchMedia(input: {
  dealerId: string;
  batchId: string;
  accompanyingText: string;
}): Promise<{
  skipOcrMediaIds: Set<string>;
  conversationText: string;
  kinds: Array<{ mediaId: string; kind: IntakeInputKind; confidence: number }>;
}> {
  const mediaRows = await prisma.intakeMedia.findMany({
    where: { batchId: input.batchId },
    orderBy: { originalOrder: "asc" },
  });

  const skipOcrMediaIds = new Set<string>();
  const kinds: Array<{ mediaId: string; kind: IntakeInputKind; confidence: number }> = [];
  const snippets: string[] = [];
  if (input.accompanyingText.trim()) snippets.push(input.accompanyingText.trim());

  for (const media of mediaRows) {
    const heuristic = classifyInputKindHeuristic({
      width: media.width,
      height: media.height,
      mimeType: media.mimeType,
      accompanyingText: input.accompanyingText,
    });
    let kind = heuristic.kind;
    let confidence = heuristic.confidence;

    const portraitTall =
      media.width &&
      media.height &&
      media.height / media.width >= 1.65;

    if (
      (kind === "UNKNOWN" && portraitTall) ||
      kind === "CUSTOMER_CONVERSATION"
    ) {
      try {
        const abs = resolveMediaAbsolutePath(media.storageKey);
        const bytes = await readFile(abs);
        const extracted = await extractTextFromIntakeImage({
          bytes,
          mimeType: media.mimeType ?? undefined,
          mediaId: media.id,
        });
        if (extracted) {
          kind = extracted.kind;
          confidence = extracted.confidence;
          if (extracted.text) snippets.push(extracted.text);
        }
      } catch {
        /* keep heuristic */
      }
    }

    kinds.push({ mediaId: media.id, kind, confidence });
    if (shouldSkipVehicleOcr(kind) || kind === "CUSTOMER_CONVERSATION") {
      skipOcrMediaIds.add(media.id);
    }

    const prev =
      (media.discoveryJson as Record<string, unknown> | null) ?? {};
    await prisma.intakeMedia.update({
      where: { id: media.id },
      data: {
        discoveryJson: toPrismaJson({
          ...prev,
          inputKind: kind,
          inputKindConfidence: confidence,
        }),
      },
    });
  }

  const conversationText = applyLaterMessageWins(mergeConversationSnippets(snippets));
  const batch = await prisma.intakeBatch.findUnique({
    where: { id: input.batchId },
    select: { sourceMetadata: true },
  });
  const prevMeta =
    (batch?.sourceMetadata as Record<string, unknown> | null) ?? {};

  let demandDraft: Record<string, unknown> | null = null;
  if (looksLikeCustomerDemandText(conversationText)) {
    const parsed = await parseDemand(conversationText);
    const hints = extractCustomerHintsFromText(conversationText);
    const safePhone = isSafePhoneForPersist(hints);
    const requiresPhoneConfirmation =
      !safePhone &&
      hints.phoneCandidates.some(
        (c) => c.confidence === "high" || c.confidence === "medium"
      );
    demandDraft = {
      rawText: conversationText,
      parsed,
      summaryHe: summarizeDemandHe(parsed),
      mediaIds: kinds
        .filter((k) => k.kind === "CUSTOMER_CONVERSATION")
        .map((k) => k.mediaId),
      status: "PENDING_DEALER_CONFIRM",
      customerHint: {
        name: hints.name,
        confirmedPhone: safePhone ? hints.normalizedPhone ?? hints.phone : null,
        phoneCandidates: hints.phoneCandidates.map((c) => ({
          raw: c.raw,
          normalized: c.normalized,
          attribution: c.attribution,
          confidence: c.confidence,
        })),
        requiresPhoneConfirmation,
      },
    };
  }

  await prisma.intakeBatch.update({
    where: { id: input.batchId },
    data: {
      sourceMetadata: toPrismaJson({
        ...prevMeta,
        inputKinds: kinds,
        demandDraft,
      }),
    },
  });

  return { skipOcrMediaIds, conversationText, kinds };
}

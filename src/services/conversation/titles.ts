import "server-only";
import { prisma } from "@/lib/prisma";
import { formatVehicleDisplayLabel } from "@/lib/vehicle-display-label";

const INTENT_TITLE_SUFFIX: Record<string, string> = {
  OWNED: "מלאי",
  OFFERED_TO_ME: "שוקל לקנות",
  TRADE_IN_CANDIDATE: "טרייד מלקוח",
  EXTERNAL: "בדיקה בלבד",
};

export async function autoTitleFromVehicle(input: {
  threadId: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  plate?: string | null;
  intent?: string | null;
}): Promise<void> {
  const base = formatVehicleDisplayLabel(input);
  const suffix =
    input.intent && INTENT_TITLE_SUFFIX[input.intent]
      ? INTENT_TITLE_SUFFIX[input.intent]
      : null;
  const title = suffix ? `${base} — ${suffix}` : base;
  await applyAutoTitle(input.threadId, title);
}

export async function autoTitleFromIntent(input: {
  threadId: string;
  summary: string;
}): Promise<void> {
  const trimmed = input.summary.trim().slice(0, 120);
  if (!trimmed) return;
  await applyAutoTitle(input.threadId, trimmed);
}

export async function autoTitleFromVehicleIntent(input: {
  threadId: string;
  candidateId: string;
  intent: string;
}): Promise<void> {
  const candidate = await prisma.vehicleCandidate.findFirst({
    where: { id: input.candidateId },
    select: {
      plateNormalized: true,
      detectedPlate: true,
      govIdentityJson: true,
    },
  });
  if (!candidate) {
    const suffix = INTENT_TITLE_SUFFIX[input.intent];
    if (suffix) await applyAutoTitle(input.threadId, `קליטה — ${suffix}`);
    return;
  }
  const gov = (candidate.govIdentityJson ?? {}) as {
    make?: string | null;
    model?: string | null;
    year?: number | null;
  };
  await autoTitleFromVehicle({
    threadId: input.threadId,
    make: gov.make,
    model: gov.model,
    year: gov.year,
    plate: candidate.plateNormalized ?? candidate.detectedPlate,
    intent: input.intent,
  });
}

async function applyAutoTitle(threadId: string, title: string): Promise<void> {
  const thread = await prisma.conversationThread.findUnique({
    where: { id: threadId },
    select: { titleSource: true },
  });
  if (!thread || thread.titleSource === "USER") return;
  if (!title.trim() || /null\s+null/i.test(title)) return;
  await prisma.conversationThread.update({
    where: { id: threadId },
    data: { title: title.trim().slice(0, 120), titleSource: "AUTO" },
  });
}

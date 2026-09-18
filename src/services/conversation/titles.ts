import "server-only";
import { prisma } from "@/lib/prisma";
import { formatVehicleDisplayLabel } from "@/lib/vehicle-display-label";

export async function autoTitleFromVehicle(input: {
  threadId: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  plate?: string | null;
}): Promise<void> {
  const title = formatVehicleDisplayLabel(input);
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

async function applyAutoTitle(threadId: string, title: string): Promise<void> {
  const thread = await prisma.conversationThread.findUnique({
    where: { id: threadId },
    select: { titleSource: true },
  });
  if (!thread || thread.titleSource === "USER") return;
  await prisma.conversationThread.update({
    where: { id: threadId },
    data: { title, titleSource: "AUTO" },
  });
}

/**
 * Normalize a WhatsApp clipboard dump so multi-message paste stays one Capture block.
 * Does not split into multiple demands — parser still sees the full context.
 */
export function normalizeWhatsAppTranscript(raw: string): string {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return "";

  const lines = text.split("\n");
  const collapsed: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed === "" && collapsed[collapsed.length - 1] === "") continue;
    collapsed.push(trimmed);
  }

  return collapsed.join("\n").trim();
}

export function mergePastedTranscript(
  existing: string,
  incoming: string
): string {
  const next = normalizeWhatsAppTranscript(incoming);
  if (!next) return existing.trim();
  const prev = existing.trim();
  if (!prev) return next;
  return `${prev}\n\n${next}`;
}

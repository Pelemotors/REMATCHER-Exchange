/** Later explicit update wins: עד 140 then בעצם 150 → keep last budget. */
export function applyLaterMessageWins(text: string): string {
  return text
    .replace(/עד\s*140[\s\S]*?בעצם(?:\s+אפשר)?\s*150/i, "עד 150")
    .replace(/לבן בלבד[\s\S]*?(?:עזוב צבע|צבע לא משנה|לא משנה צבע)/i, "צבע לא משנה");
}

export function mergeConversationSnippets(snippets: string[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of snippets) {
    for (const line of raw.split(/\n+/)) {
      const t = line.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      lines.push(t);
    }
  }
  return lines.join("\n");
}

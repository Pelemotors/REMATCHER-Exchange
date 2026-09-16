import type { ParsedDemand } from "@/lib/schemas/ai";

function known(field?: { value?: unknown; status?: string } | null): string | null {
  if (!field || field.status !== "known" || field.value == null) return null;
  return String(field.value);
}

export function summarizeDemandHe(parsed: ParsedDemand): string {
  const make = known(parsed.make);
  const model = known(parsed.model);
  const yearMin = known(parsed.yearMin);
  const budget = known(parsed.budgetMax);
  const colorSoft = parsed.softPreferences.find((p) => p.field === "color");
  const colorPref =
    (parsed.colorPreferences && parsed.colorPreferences[0]) ||
    (colorSoft ? String(colorSoft.value ?? "") : "");

  const lines: string[] = ["הבנתי 👍"];
  const vehicle = [make, model].filter(Boolean).join(" ");
  if (vehicle) lines.push(`הלקוח מחפש ${vehicle}.`);
  else lines.push("הלקוח מחפש רכב — עדיין בלי דגם חד.");
  if (yearMin) lines.push(`מ-${yearMin} ומעלה.`);
  if (budget) {
    const n = Number(budget);
    lines.push(`עד ${n.toLocaleString("he-IL")} ₪.`);
  }
  if (colorPref && !/לא משנה|any/i.test(colorPref)) {
    const isSoft =
      /עדיף|רצוי|אם יש/.test(parsed.rawSummary ?? "") ||
      parsed.softPreferences.some((p) => p.field === "color");
    lines.push(isSoft ? `עדיפות ל${colorPref}.` : `צבע: ${colorPref}.`);
  }
  return lines.join("\n");
}

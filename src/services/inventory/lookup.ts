import "server-only";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatNumber } from "@/lib/utils";

export type InventoryCandidate = {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  b2bPrice: number | null;
  retailPrice: number | null;
  status: string;
};

export function vehicleTitle(v: {
  make?: string | null;
  model?: string | null;
  year?: number | null;
}): string {
  return [v.make, v.model, v.year].filter(Boolean).join(" ") || "רכב";
}

export function vehicleSummaryLine(v: InventoryCandidate): string {
  const parts = [vehicleTitle(v)];
  if (v.mileage != null) parts.push(`${formatNumber(v.mileage)} ק״מ`);
  if (v.b2bPrice != null) parts.push(`${formatCurrency(v.b2bPrice)} B2B`);
  return parts.join(" · ");
}

/** Load active inventory candidates for dealer (minimal fields for AI/disambiguation). */
export async function listActiveInventoryCandidates(
  dealerId: string
): Promise<InventoryCandidate[]> {
  return prisma.vehicle.findMany({
    where: { dealerId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      mileage: true,
      b2bPrice: true,
      retailPrice: true,
      status: true,
    },
  });
}

/**
 * Deterministic fuzzy match against dealer-owned active inventory.
 * Never invents; returns empty / one / many.
 */
export function matchVehiclesFromText(
  message: string,
  candidates: InventoryCandidate[]
): InventoryCandidate[] {
  const m = message.trim().toLowerCase();
  if (!m || candidates.length === 0) return [];

  const scored = candidates
    .map((v) => {
      let score = 0;
      const make = (v.make ?? "").toLowerCase();
      const model = (v.model ?? "").toLowerCase();
      const year = v.year != null ? String(v.year) : "";
      const yearShort = year.length === 4 ? year.slice(2) : "";

      if (make && m.includes(make)) score += 3;
      if (model && m.includes(model)) score += 4;
      // Hebrew / common nicknames
      if (model.includes("corolla") && /קורולה|corolla/i.test(m)) score += 4;
      if (model.includes("cx-5") || model.includes("cx5")) {
        if (/cx[\s-]?5|סייקס|סי איקס/i.test(m)) score += 4;
      }
      if (model.includes("tucson") && /טוסון|tucson/i.test(m)) score += 4;
      if (model.includes("sportage") && /ספורטאז|sportage/i.test(m)) score += 4;
      if (year && (m.includes(year) || (yearShort && m.includes(yearShort)))) {
        score += 2;
      }
      return { v, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [];
  const top = scored[0].score;
  return scored.filter((x) => x.score >= top - 1).map((x) => x.v);
}

export function parseB2bUpdate(message: string): number | null {
  const b2b = message.match(
    /(?:b2b|בי\s*טו\s*בי|לסוחרים?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:אלף)?/i
  );
  if (b2b) {
    let n = parseFloat(b2b[1].replace(",", "."));
    if (/אלף/i.test(b2b[0]) || n < 1000) n = Math.round(n * 1000);
    return Math.round(n);
  }
  const updatePrice = message.match(
    /(?:עדכן|תעדכן|שנה).*?(?:ל[-–]?\s*)?(\d+(?:[.,]\d+)?)\s*(?:אלף)?/i
  );
  if (updatePrice && /b2b|בי\s*טו|מחיר/i.test(message)) {
    let n = parseFloat(updatePrice[1].replace(",", "."));
    if (/אלף/i.test(updatePrice[0]) || n < 1000) n = Math.round(n * 1000);
    return Math.round(n);
  }
  return null;
}

export function isSoldIntent(message: string): boolean {
  return /נמכר|נמכרה|לא זמין|תוריד|הסר.*מלאי|סמן.*נמכר|כבר לא זמין/i.test(
    message
  );
}

export function isUpdateIntent(message: string): boolean {
  return /עדכן|תעדכן|(?:שנה|שנה את).*(?:מחיר|b2b|בי\s*טו)/i.test(message);
}

export function isInventoryReadIntent(message: string): boolean {
  return /כמה.*מלאי|מה יש לי|מה דורש טיפול|המלאי שלי/i.test(message);
}

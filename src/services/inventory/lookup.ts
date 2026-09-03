import "server-only";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { ProposedVehicleChanges } from "@/services/assistant/conversation-state";
import { parseOwnershipAnswer } from "@/services/assistant/inventory-draft";

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
  if (v.b2bPrice != null) {
    parts.push(`${formatCurrency(v.b2bPrice)} מחיר לסוחר`);
  }
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

function parseAmount(raw: string, fragment: string): number | null {
  const aluf = fragment.match(/(\d+(?:[.,]\d+)?)\s*אלף/i);
  if (aluf) return Math.round(parseFloat(aluf[1].replace(",", ".")) * 1000);
  const digits = fragment.replace(/[^\d]/g, "");
  if (!digits) return null;
  let n = parseInt(digits, 10);
  const shortAsThousands =
    n > 0 &&
    n < 1000 &&
    /אלף|ק.?מ|מחיר|לסוחר|b2b|על\s+\d|עכשיו/i.test(raw);
  if (shortAsThousands) {
    n *= 1000;
  }
  if (n >= 1000 && n < 10_000_000) return n;
  if (n > 0 && n < 2_000_000 && /ק.?מ|קילומטר/i.test(raw)) return n;
  return null;
}

export function parseB2bUpdate(message: string): number | null {
  const b2b = message.match(
    /(?:b2b|בי\s*טו\s*בי|לסוחרים?|מחיר\s*לסוחר)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:אלף)?/i
  );
  if (b2b) {
    let n = parseFloat(b2b[1].replace(",", "."));
    if (/אלף/i.test(b2b[0]) || n < 1000) n = Math.round(n * 1000);
    return Math.round(n);
  }
  const updatePrice = message.match(
    /(?:עדכן|תעדכן|שנה).*?(?:ל[-–]?\s*)?(\d+(?:[.,]\d+)?)\s*(?:אלף)?/i
  );
  if (updatePrice && /b2b|בי\s*טו|מחיר\s*לסוחר|לסוחר/i.test(message)) {
    let n = parseFloat(updatePrice[1].replace(",", "."));
    if (/אלף/i.test(updatePrice[0]) || n < 1000) n = Math.round(n * 1000);
    return Math.round(n);
  }
  return null;
}

/**
 * Parse natural-language inventory field updates.
 * Never mutates — caller must confirm. Ambiguous → null changes.
 */
export function parseVehicleUpdateChanges(
  message: string
): ProposedVehicleChanges | null {
  const m = message.trim();
  const changes: ProposedVehicleChanges = {};

  const ownership = parseOwnershipAnswer(m);
  if (ownership && ownership !== "skip") {
    if (ownership.ownershipHand != null) {
      changes.ownershipHand = ownership.ownershipHand;
    }
    if (ownership.ownershipType) changes.ownershipType = ownership.ownershipType;
  }

  if (/צבע/i.test(m)) {
    const color = m.replace(/^.*צבע\s*/i, "").replace(/[.?!,].*$/, "").trim();
    if (color && color.length < 40) changes.color = color;
  } else if (/^(לבן|שחור|אפור|כסף|כסוף|אדום|כחול|ירוק)$/i.test(m)) {
    changes.color = m;
  }

  if (/גימור|executive|luxury|comfort|premium|רמת/i.test(m)) {
    const trimMatch = m.match(
      /(?:גימור|רמת(?:\s*גימור)?|trim)\s*[:=]?\s*([^\n,.]+)/i
    );
    if (trimMatch) changes.trim = trimMatch[1].trim();
    else {
      const known = m.match(/(executive|luxury|comfort|premium)/i);
      if (known) changes.trim = known[1];
      else if (/זה\s+(\S+)/i.test(m)) {
        changes.trim = m.match(/זה\s+(\S+)/i)?.[1] ?? undefined;
      }
    }
  }

  const dealer = parseB2bUpdate(m);
  if (dealer != null) changes.b2bPrice = dealer;

  if (/מחיר.*לקוח|קמעונאי|retail|(?:ה)?מחיר\s*(?:עכשיו|הוא)?\s*/i.test(m) && !/לסוחר|b2b/i.test(m)) {
    const n = parseAmount(m, m);
    if (n != null && n >= 1000) changes.retailPrice = n;
  }

  // Mileage — "79 אלף", "על 79", "ק״מ 79000"
  if (
    /ק.?מ|קילומטר|מייל|mileage|על\s+\d|ל[-–]?\s*\d+\s*אלף/i.test(m) ||
    (/\d+\s*אלף/i.test(m) && !/לסוחר|b2b|מחיר/i.test(m))
  ) {
    const n = parseAmount(m, m);
    if (n != null && n < 2_000_000) {
      // Prefer mileage when "אלף" without price labels, or explicit km
      if (/ק.?מ|קילומטר|על\s+\d/i.test(m) || (!/מחיר|לסוחר|b2b/i.test(m) && n < 500000)) {
        changes.mileage = n;
      }
    }
  }

  // Contextual shorthand: "היא על 79 עכשיו" / "79 אלף עכשיו"
  if (
    Object.keys(changes).length === 0 &&
    /(?:היא|הוא|עכשיו|ל[-–]?)\s*.*\d/i.test(m)
  ) {
    const n = parseAmount(m, m);
    if (n != null && n < 500000) changes.mileage = n;
    else if (n != null && n >= 50000) changes.b2bPrice = n;
  }

  // Explicit "על N" mileage even when other parsers missed
  if (changes.mileage == null && /על\s+(\d+(?:[.,]\d+)?)\s*(?:אלף)?/i.test(m)) {
    const n = parseAmount(m, m);
    if (n != null && n < 500000) changes.mileage = n;
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

/** Clear sold language — mark sold candidate */
export function isSoldIntent(message: string): boolean {
  return /נמכר|נמכרה|תוריד|הסר.*מלאי|סמן.*נמכר|כבר לא אצל|לא רלוונט/i.test(
    message
  );
}

/**
 * Soft unavailable — must NOT blindly MARK_SOLD.
 * Domain supports ACTIVE | SOLD | ARCHIVED.
 */
export function isUnavailableIntent(message: string): boolean {
  return /לא זמינ|כרגע לא|הקפא|השבת|לא במלאי|unavailable/i.test(message);
}

export function isUpdateIntent(message: string): boolean {
  return (
    /עדכן|תעדכן|(?:שנה|שנה את).*(?:מחיר|b2b|בי\s*טו|ק.?מ|יד|צבע|גימור|מקור)/i.test(
      message
    ) ||
    /היא\s+יד|המקור\s+שלה|הצבע\s+|מחיר\s+לסוחר|על\s+\d+\s*(אלף)?\s*עכשיו/i.test(
      message
    )
  );
}

export function isInventoryReadIntent(message: string): boolean {
  return /כמה.*מלאי|מה יש לי|מה דורש טיפול|המלאי שלי/i.test(message);
}

export function describeProposedChanges(changes: ProposedVehicleChanges): string {
  const parts: string[] = [];
  if (changes.mileage != null) {
    parts.push(`קילומטראז׳ ${formatNumber(changes.mileage)}`);
  }
  if (changes.b2bPrice != null) {
    parts.push(`מחיר לסוחר ${formatCurrency(changes.b2bPrice)}`);
  }
  if (changes.retailPrice != null) {
    parts.push(`מחיר לקוח ${formatCurrency(changes.retailPrice)}`);
  }
  if (changes.ownershipHand != null) parts.push(`יד ${changes.ownershipHand}`);
  if (changes.ownershipType) {
    const map: Record<string, string> = {
      private: "מקור פרטי",
      leasing: "מקור ליסינג",
      rental: "מקור השכרה",
      company: "מקור חברה",
    };
    parts.push(map[changes.ownershipType] ?? changes.ownershipType);
  }
  if (changes.trim) parts.push(`רמת גימור ${changes.trim}`);
  if (changes.color) parts.push(`צבע ${changes.color}`);
  if (changes.status === "ARCHIVED") parts.push("לא זמין (ארכיון)");
  if (changes.status === "SOLD") parts.push("נמכר");
  return parts.join(" · ");
}

/** Dealer-facing demand summary from confirmedJson */

export interface DemandConfirmed {
  make?: string | null;
  model?: string | null;
  yearMin?: number | null;
  yearMax?: number | null;
  budgetMax?: number | null;
  trimPreference?: string | null;
  colorExclusions?: string[];
}

export type DemandUxStatus =
  | "DRAFT"
  | "PENDING_CONFIRMATION"
  | "ACTIVE"
  | "EXPIRING"
  | "EXPIRED"
  | "CLOSED";

export function confirmedFromJson(json: unknown): DemandConfirmed {
  const c = (json ?? {}) as Record<string, unknown>;
  return {
    make: (c.make as string) ?? null,
    model: (c.model as string) ?? null,
    yearMin: (c.yearMin as number) ?? null,
    yearMax: (c.yearMax as number) ?? null,
    budgetMax: (c.budgetMax as number) ?? null,
    trimPreference: (c.trimPreference as string) ?? null,
    colorExclusions: (c.colorExclusions as string[]) ?? [],
  };
}

export function demandTitle(confirmed: DemandConfirmed): string {
  const parts = [confirmed.make, confirmed.model].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "חיפוש";
}

export function demandSubtitle(confirmed: DemandConfirmed): string {
  const parts: string[] = [];
  if (confirmed.yearMin) parts.push(`${confirmed.yearMin} ומעלה`);
  if (confirmed.budgetMax) {
    parts.push(
      `עד ${new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(confirmed.budgetMax)}`
    );
  }
  return parts.join(" · ");
}

export function demandTags(confirmed: DemandConfirmed): string[] {
  const tags: string[] = [];
  if (confirmed.trimPreference) tags.push(confirmed.trimPreference);
  for (const c of confirmed.colorExclusions ?? []) {
    tags.push(`לא ${c}`);
  }
  return tags;
}

export function computeDemandUxStatus(
  status: string,
  expiresAt: Date | null | undefined
): DemandUxStatus {
  if (status === "CANCELLED") return "CLOSED";
  if (status === "EXPIRED") return "EXPIRED";
  if (status === "DRAFT") return "DRAFT";
  if (status === "PENDING_CONFIRMATION") return "PENDING_CONFIRMATION";
  if (status === "ACTIVE" && expiresAt) {
    const msLeft = expiresAt.getTime() - Date.now();
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    if (daysLeft <= 1 && daysLeft >= 0) return "EXPIRING";
    if (daysLeft < 0) return "EXPIRED";
  }
  return "ACTIVE";
}

export function demandStatusLabel(uxStatus: DemandUxStatus): string {
  switch (uxStatus) {
    case "ACTIVE":
      return "פעיל";
    case "EXPIRING":
      return "מסתיים בקרוב";
    case "EXPIRED":
      return "הסתיים";
    case "CLOSED":
      return "נסגר";
    case "PENDING_CONFIRMATION":
      return "ממתין לאישור";
    default:
      return "טיוטה";
  }
}

export function daysUntilExpiry(expiresAt: Date | null | undefined): number | null {
  if (!expiresAt) return null;
  return Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/** Natural-language reflection for dealer — no network data */
export function demandReflectionText(
  confirmed: DemandConfirmed,
  uxStatus: DemandUxStatus,
  daysLeft: number | null
): string {
  const title = demandTitle(confirmed);
  const subtitle = demandSubtitle(confirmed);
  const base = subtitle
    ? `אתה מחפש ${title}, ${subtitle}.`
    : `אתה מחפש ${title}.`;

  const tags = demandTags(confirmed);
  const tagPart =
    tags.length > 0 ? ` ${tags.join(" · ")}.` : "";

  let statusPart = "";
  if (uxStatus === "ACTIVE" && daysLeft != null) {
    statusPart =
      daysLeft > 1
        ? ` החיפוש פעיל — נותרו ${daysLeft} ימים.`
        : daysLeft === 1
          ? " החיפוש פעיל — נותר יום אחד."
          : " החיפוש פעיל.";
  } else if (uxStatus === "EXPIRING") {
    statusPart = " החיפוש עומד להסתיים בקרוב.";
  } else if (uxStatus === "EXPIRED") {
    statusPart = " החיפוש הסתיים.";
  } else if (uxStatus === "CLOSED") {
    statusPart = " החיפוש נסגר.";
  }

  return `${base}${tagPart}${statusPart}`.trim();
}

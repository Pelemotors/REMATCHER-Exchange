/**
 * Canonical user-facing vehicle label.
 * Never emit "null null 2013" / "undefined" / empty double-spaces.
 */
export function sanitizeVehicleField(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (/^(null|undefined|none)$/i.test(trimmed)) return null;
  return trimmed;
}

export function formatVehicleDisplayLabel(input: {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  plate?: string | null;
  fallback?: string;
}): string {
  const make = sanitizeVehicleField(input.make);
  const model = sanitizeVehicleField(input.model);
  const year =
    typeof input.year === "number" && Number.isFinite(input.year) && input.year > 1900
      ? String(input.year)
      : null;
  const identityParts = [make, model].filter(Boolean) as string[];
  if (identityParts.length > 0) {
    return year ? [...identityParts, year].join(" ") : identityParts.join(" ");
  }

  const plate = sanitizeVehicleField(input.plate);
  if (plate) return `רכב ${plate}`;

  return input.fallback ?? "רכב שטרם זוהה";
}

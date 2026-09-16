/**
 * Public catalog → WhatsApp interest on a specific vehicle.
 * Israeli mobiles: 05X… → 9725X… ; already-international left intact.
 */

export type CatalogVehicleInterest = {
  title: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  retailPrice?: number | null;
  slug?: string;
  publicRef?: string | null;
};

export function israeliPhoneToWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("972")) {
    return digits.length >= 11 ? digits : null;
  }
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) {
    return `972${digits.slice(1)}`;
  }
  if (digits.length === 9 && digits.startsWith("5")) {
    return `972${digits}`;
  }
  return digits.length >= 9 ? digits : null;
}

export function pickCatalogWhatsAppNumber(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const c of candidates) {
    const wa = israeliPhoneToWhatsApp(c);
    if (wa) return wa;
  }
  return null;
}

export function catalogVehicleInterestText(vehicle: CatalogVehicleInterest): string {
  const name =
    [vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.title;
  const year = vehicle.year ? ` ${vehicle.year}` : "";
  let text = `היי, אני מתעניין ב-${name}${year} שראיתי בקטלוג שלכם`;
  if (vehicle.publicRef && vehicle.publicRef.length <= 24) {
    text += ` (${vehicle.publicRef})`;
  }
  return text;
}

export function catalogVehicleWhatsAppHref(
  phone: string | null | undefined,
  vehicle: CatalogVehicleInterest
): string | null {
  const wa = israeliPhoneToWhatsApp(phone);
  if (!wa) return null;
  const text = catalogVehicleInterestText(vehicle);
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

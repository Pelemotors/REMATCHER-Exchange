/**
 * Public catalog → WhatsApp interest on a specific vehicle.
 * Israeli mobiles: 05X… → 9725X… ; already-international left intact.
 */

export type CatalogVehicleInterest = {
  title: string;
  year?: number | null;
  retailPrice?: number | null;
  slug?: string;
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
  const bits = [vehicle.title];
  if (vehicle.year) bits.push(String(vehicle.year));
  if (vehicle.retailPrice != null && Number.isFinite(vehicle.retailPrice)) {
    bits.push(
      new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: "ILS",
        maximumFractionDigits: 0,
      }).format(vehicle.retailPrice)
    );
  }
  return `שלום, מתעניין ברכב ${bits.join(" · ")} מהקטלוג`;
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

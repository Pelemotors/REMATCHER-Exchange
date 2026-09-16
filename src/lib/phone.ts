/**
 * Israeli-centric phone normalize for Customer identity.
 * Never invents a phone — returns null if insufficient digits.
 */
export function normalizePhoneIL(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("972")) {
    // ok
  } else if (digits.startsWith("0") && digits.length >= 9) {
    digits = `972${digits.slice(1)}`;
  } else if (digits.length === 9 && digits.startsWith("5")) {
    digits = `972${digits}`;
  } else if (digits.length < 10) {
    return null;
  }
  // Mobile IL: 9725xxxxxxxx (12 digits) or landline variants — keep 972 + national
  if (digits.startsWith("972") && digits.length >= 11 && digits.length <= 13) {
    return digits;
  }
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

export function phonesLikelySame(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizePhoneIL(a);
  const nb = normalizePhoneIL(b);
  return Boolean(na && nb && na === nb);
}

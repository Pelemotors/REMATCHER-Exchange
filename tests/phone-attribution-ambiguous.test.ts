import { describe, expect, it } from "vitest";
import {
  extractCustomerHintsFromText,
  extractPhoneCandidates,
} from "@/services/capture/customer-extract";

describe("phone attribution", () => {
  it("prefers high-confidence message body phone", () => {
    const text = [
      "[16.9.2026, 17:45:05] סוכן: שלום",
      "[16.9.2026, 17:46:12] לקוח: התקשרו אלי 052-765-4321 בבקשה",
    ].join("\n");
    const hints = extractCustomerHintsFromText(text);
    expect(hints.phone).toMatch(/052/);
    expect(hints.normalizedPhone).toBeTruthy();
    expect(hints.phoneCandidates.length).toBeGreaterThanOrEqual(1);
  });

  it("leaves phone null when multiple high-confidence candidates", () => {
    const text = [
      "052-111-1111 מחפש טוסון",
      "גם אפשר 052-222-2222",
    ].join("\n");
    const hints = extractCustomerHintsFromText(text);
    expect(hints.phone).toBeNull();
    expect(hints.normalizedPhone).toBeNull();
    expect(hints.phoneCandidates.length).toBeGreaterThanOrEqual(2);
  });

  it("tags header vs message attribution", () => {
    const line =
      "[16.9.2026, 17:45:05] אודד: 050-333-4444 במסר";
    const candidates = extractPhoneCandidates(line);
    const inMessage = candidates.find((c) => c.raw.includes("4444"));
    expect(inMessage?.attribution).toBe("MESSAGE");
  });
});

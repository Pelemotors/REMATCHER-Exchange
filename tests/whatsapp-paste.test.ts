import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  mergePastedTranscript,
  normalizeWhatsAppTranscript,
} from "@/lib/whatsapp-transcript";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("WhatsApp transcript paste", () => {
  it("keeps a 3-message WhatsApp dump as one Capture block", () => {
    const dump = [
      "[16.9.2026, 17:45:05] אודד מוקד מלווה: פמה: מעביר לבקרה",
      "[16.9.2026, 17:46:12] אודד מוקד מלווה: מחפש טוסון 2021 עד 125",
      "[16.9.2026, 17:46:40] אודד מוקד מלווה: עדיף היברידי",
    ].join("\n");
    const out = normalizeWhatsAppTranscript(dump);
    expect(out).toContain("פמה: מעביר לבקרה");
    expect(out).toContain("מחפש טוסון 2021 עד 125");
    expect(out).toContain("עדיף היברידי");
    expect(out.split("\n").length).toBe(3);
  });

  it("appends a second paste with a blank line instead of replacing", () => {
    const first = "מחפש ספורטאז 2022";
    const second = "עד 120 אלף\nלא אדום";
    expect(mergePastedTranscript(first, second)).toBe(
      "מחפש ספורטאז 2022\n\nעד 120 אלף\nלא אדום"
    );
  });

  it("home capture CTA and composer use handoff + paste helpers", () => {
    const home = read("src/components/home/home-v2.tsx");
    const flow = read("src/components/demand/create-demand-flow.tsx");
    const intake = read("src/app/(dealer)/intake/page.tsx");
    const agent = read("src/services/assistant/action-gateway.ts");
    expect(home).toContain("/intake/handoff");
    expect(home).not.toMatch(/href="\/intake"/);
    expect(intake).toContain('redirect("/intake/handoff")');
    expect(agent).toContain('href: "/intake/handoff"');
    expect(flow).toContain("handleTextareaPaste");
    expect(flow).toContain("readClipboardText");
    expect(flow).toContain("mergePastedTranscript");
  });
});

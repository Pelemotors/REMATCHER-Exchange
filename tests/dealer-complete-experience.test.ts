import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseIntakeIntentText,
  intentFromButton,
  isDiscardIntent,
} from "@/services/intake/intent";
import {
  classifyInputKindHeuristic,
  shouldSkipVehicleOcr,
} from "@/services/intake/input-kind";
import { applyLaterMessageWins, mergeConversationSnippets } from "@/services/intake/conversation-text";
import { parseDemandFallback } from "@/services/ai/demand-parser";
import { summarizeDemandHe } from "@/services/intake/demand-summary";
import { confirmedFromJson } from "@/lib/demand-display";

describe("dealer complete experience — vehicle intent", () => {
  it("כולם שלי חוץ מהאחרון does not mark the last as inventory", () => {
    const p = parseIntakeIntentText("כולם שלי חוץ מהאחרון");
    expect(p.allExceptLast).toBe("OWNED");
    expect(p.all).toBeUndefined();
  });

  it("כולם למלאי still means every candidate", () => {
    expect(parseIntakeIntentText("כולם למלאי").all).toBe("OWNED");
  });

  it("mixed index intents", () => {
    const p = parseIntakeIntentText(
      "הראשון שלי, השני מציעים לי והשלישי רק לבדיקה"
    );
    expect(p.byIndex.find((x) => x.index === 0)?.intent).toBe("OWNED");
    expect(p.byIndex.find((x) => x.index === 1)?.intent).toBe("OFFERED_TO_ME");
    expect(p.byIndex.find((x) => x.index === 2)?.intent).toBe("EXTERNAL");
  });

  it("discard button and free text", () => {
    expect(isDiscardIntent("DISCARD")).toBe(true);
    expect(isDiscardIntent("מחק")).toBe(true);
    expect(intentFromButton("למלאי")).toBe("OWNED");
    expect(parseIntakeIntentText("טעות בהעלאה").discard).toBe(true);
  });
});

describe("dealer complete experience — input kind", () => {
  it("landscape car photo is not a WhatsApp conversation", () => {
    const k = classifyInputKindHeuristic({
      width: 1600,
      height: 900,
      accompanyingText: "מחפש CX5",
    });
    expect(k.kind).toBe("VEHICLE_PHOTO");
  });

  it("tall portrait is conversation-like", () => {
    const k = classifyInputKindHeuristic({ width: 390, height: 844 });
    expect(k.kind).toBe("CUSTOMER_CONVERSATION");
    expect(shouldSkipVehicleOcr(k.kind)).toBe(true);
  });

  it("demand text without layout is conversation", () => {
    const k = classifyInputKindHeuristic({
      accompanyingText: "מחפש CX5 22+ עד 140",
    });
    expect(k.kind).toBe("CUSTOMER_CONVERSATION");
  });
});

describe("dealer complete experience — demand understanding", () => {
  it("extracts CX-5 2022 budget 140000 as soft white preference", () => {
    const p = parseDemandFallback(
      "מחפש לאשתי CX5\n22 ומעלה\nעד 140\nעדיף לבן\nלא השכרה"
    );
    expect(p.make?.value).toBe("Mazda");
    expect(p.model?.value).toBe("CX-5");
    expect(p.yearMin?.value).toBe(2022);
    expect(p.budgetMax?.value).toBe(140000);
    expect(p.softPreferences.some((x) => x.field === "color")).toBe(true);
  });

  it("later explicit budget wins", () => {
    const merged = applyLaterMessageWins("עד 140\nבעצם אפשר 150");
    expect(merged).toMatch(/עד 150/);
    const p = parseDemandFallback(merged);
    expect(p.budgetMax?.value).toBe(150000);
  });

  it("later color drop wins", () => {
    const merged = applyLaterMessageWins("לבן בלבד\nעזוב צבע, לא משנה");
    expect(merged).toMatch(/צבע לא משנה/);
  });

  it("multi screenshot snippets become one conversation", () => {
    const t = mergeConversationSnippets([
      "מחפש CX5",
      "22 ומעלה",
      "עד 140, לבן עדיף",
      "מחפש CX5",
    ]);
    expect(t.split("\n")).toHaveLength(3);
  });

  it("confirmation copy is Hebrew not JSON", () => {
    const p = parseDemandFallback("מחפש cx5 22+ עד 140");
    const he = summarizeDemandHe(p);
    expect(he).toContain("הבנתי");
    expect(he).not.toContain("{");
    expect(he).toMatch(/CX-5|מאזדה|Mazda/i);
  });

  it("natural dealer phrases map models", () => {
    expect(parseDemandFallback("יש לי לקוח על x3 עד 200").model?.value).toBe("X3");
    expect(parseDemandFallback("מחפש אקסטרייל דיזל 7 מקומות").model?.value).toBe(
      "X-Trail"
    );
    expect(parseDemandFallback("לקוח רוצה ראב 4 לא השכרה עד 160").model?.value).toBe(
      "RAV4"
    );
  });

  it("confirmedJson status fields unwrap for matching", () => {
    const c = confirmedFromJson({
      make: { value: "Mazda", status: "known" },
      model: { value: "CX-5", status: "known" },
      yearMin: { value: 2022, status: "known" },
      budgetMax: { value: 140000, status: "known" },
    });
    expect(c.make).toBe("Mazda");
    expect(c.model).toBe("CX-5");
    expect(c.yearMin).toBe(2022);
    expect(c.budgetMax).toBe(140000);
  });
});

describe("dealer complete experience — wiring", () => {
  it("inventory PATCH accepts ARCHIVED without Sold", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/api/inventory/route.ts"),
      "utf8"
    );
    expect(src).toContain('"ARCHIVED"');
    expect(src).toContain("removeVehicleFromInventoryForDealer");
  });

  it("intake UI exposes discard and demand confirm", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/intake/intake-handoff-client.tsx"),
      "utf8"
    );
    expect(src).toContain("DISCARD");
    expect(src).toContain("confirmDemandDraft");
    expect(src).toContain("submitTextOnly");
  });

  it("inventory editor exposes הסר מהמלאי", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/inventory/inventory-page-client.tsx"),
      "utf8"
    );
    expect(src).toContain("הסר מהמלאי");
    expect(src).toContain("ARCHIVED");
  });

  it("process-batch skips conversation OCR and never auto-commits", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/intake/process-batch.ts"),
      "utf8"
    );
    expect(src).toContain("classifyIntakeBatchMedia");
    expect(src).toContain("skipOcrMediaIds");
    expect(src).toContain("autoCommit: false");
    expect(src).not.toContain("commitReadyCandidates");
  });

  it("Demand confirm still runs matching; inventory mutation rematches later vehicles", () => {
    const confirm = readFileSync(
      join(process.cwd(), "src/app/api/demands/confirm/route.ts"),
      "utf8"
    );
    const rematch = readFileSync(
      join(process.cwd(), "src/services/matching/inventory-rematch.ts"),
      "utf8"
    );
    expect(confirm).toContain("runMatchingForDemand");
    expect(rematch).toContain('status: "ACTIVE"');
    expect(rematch).toContain("dealerId: { not: params.sellerDealerId }");
  });

  it("empty vehicle batch is READY so demand drafts are not stuck processing", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/intake/status.ts"),
      "utf8"
    );
    expect(src).toContain("if (total === 0) batchStatus = \"READY\"");
  });

  it("forensic batch id is not referenced as a mutation target", () => {
    const processSrc = readFileSync(
      join(process.cwd(), "src/services/intake/process-batch.ts"),
      "utf8"
    );
    expect(processSrc).not.toContain("cmu4k7t8v003yjktzkcr5anbu");
  });
});

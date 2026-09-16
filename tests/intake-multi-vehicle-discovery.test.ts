import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assignMediaToIdentityGroups,
  INTAKE_OCR_CONCURRENCY,
  INTAKE_GOV_CONCURRENCY,
  mapWithConcurrency,
} from "@/services/intake/discovery";

const root = process.cwd();

function media(
  items: Array<{ id: string; order: number; plate?: string | null }>
) {
  return items.map((m) => ({
    id: m.id,
    originalOrder: m.order,
    plateNormalized: m.plate ?? null,
    plateConfidence: m.plate ? 0.9 : null,
  }));
}

describe("multi-vehicle discovery grouping", () => {
  it("A: 16 images / 7 vehicles → 7 candidates", () => {
    const plates = ["11111111", "22222222", "33333333", "44444444", "55555555", "66666666", "77777777"];
    const items: Array<{ id: string; order: number; plate?: string | null }> = [];
    let order = 0;
    for (let v = 0; v < 7; v++) {
      items.push({ id: `p${v}`, order: order++, plate: plates[v] });
      if (v < 2) items.push({ id: `i${v}a`, order: order++ });
      if (v === 3) items.push({ id: `i${v}a`, order: order++ }, { id: `i${v}b`, order: order++ });
    }
    while (items.length < 16) {
      items.push({ id: `tail${items.length}`, order: order++ });
    }
    const groups = assignMediaToIdentityGroups(media(items));
    expect(groups.filter((g) => g.plate).length).toBe(7);
    expect(groups.map((g) => g.plate).filter(Boolean).sort()).toEqual([...plates].sort());
    expect(groups.reduce((n, g) => n + g.mediaIds.length, 0)).toBe(16);
  });

  it("B: multiple images / one vehicle → one candidate", () => {
    const groups = assignMediaToIdentityGroups(
      media([
        { id: "1", order: 0, plate: "83089302" },
        { id: "2", order: 1 },
        { id: "3", order: 2 },
        { id: "4", order: 3 },
      ])
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.plate).toBe("83089302");
    expect(groups[0]?.groupingReason).toBe("single_plate");
    expect(groups[0]?.mediaIds).toHaveLength(4);
  });

  it("C: first plate A then plate B → two candidates", () => {
    const groups = assignMediaToIdentityGroups(
      media([
        { id: "a", order: 0, plate: "11111111" },
        { id: "b", order: 1, plate: "22222222" },
      ])
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.plate).sort()).toEqual(["11111111", "22222222"]);
    expect(groups.every((g) => g.groupingReason === "distinct_plate")).toBe(true);
  });

  it("D: plate A, interiors, plate B → interiors stay with A", () => {
    const groups = assignMediaToIdentityGroups(
      media([
        { id: "a", order: 0, plate: "11111111" },
        { id: "int1", order: 1 },
        { id: "int2", order: 2 },
        { id: "b", order: 3, plate: "22222222" },
      ])
    );
    expect(groups).toHaveLength(2);
    const a = groups.find((g) => g.plate === "11111111")!;
    const b = groups.find((g) => g.plate === "22222222")!;
    expect(a.mediaIds).toEqual(["a", "int1", "int2"]);
    expect(b.mediaIds).toEqual(["b"]);
  });

  it("first OCR plate does not terminate remaining discovery", () => {
    const src = readFileSync(join(root, "src/services/intake/process-batch.ts"), "utf8");
    expect(src).toContain("mapWithConcurrency(mediaRows, INTAKE_OCR_CONCURRENCY");
    expect(src).not.toMatch(/ordered\.slice\(\s*0\s*,\s*3\s*\)/);
    expect(src).not.toMatch(/if \(ocr[\s\S]{0,180}?break/);
    expect(src).not.toContain("commitReadyCandidates");
    expect(src).toContain("autoCommit: false");
    expect(src).not.toContain("text_multi_plate");
  });

  it("unknown/OTHER category is attached, not skipped", () => {
    const commit = readFileSync(join(root, "src/services/intake/commit.ts"), "utf8");
    expect(commit).toContain('row.categoryHint ?? "OTHER"');
    expect(commit).not.toMatch(/if \(!row\.categoryHint \|\| row\.categoryHint === "OTHER"\) \{\s*continue/);
  });

  it("controlled concurrency is bounded", () => {
    expect(INTAKE_OCR_CONCURRENCY).toBe(3);
    expect(INTAKE_GOV_CONCURRENCY).toBe(2);
  });

  it("mapWithConcurrency respects the limit and preserves order", async () => {
    let inflight = 0;
    let max = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      inflight++;
      max = Math.max(max, inflight);
      await new Promise((r) => setTimeout(r, 15));
      inflight--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(max).toBeLessThanOrEqual(2);
  });

  it("unplated batch stays one candidate, not silently dropped", () => {
    const groups = assignMediaToIdentityGroups(
      media([
        { id: "1", order: 0 },
        { id: "2", order: 1 },
        { id: "3", order: 2 },
      ])
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.groupingReason).toBe("unplated_batch");
    expect(groups[0]?.mediaIds).toHaveLength(3);
  });
});

/**
 * Live plate-OCR quality benchmark.
 * Default model is the currently configured plate OCR model (gpt-5.4-mini).
 * Override with OPENAI_PLATE_OCR_MODEL to compare.
 *
 * Usage:
 *   set -a && source .env.production && set +a
 *   npx tsx --require ./scripts/register-server-only.cjs scripts/benchmark-plate-ocr.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Case = {
  id: string;
  file: string;
  expected: string | null;
  kind: string;
};

type Verdict = "correct" | "incorrect" | "no_result" | "false_positive";

const ASSETS =
  "/root/.cursor/projects/srv-gal-rematcher-app/assets";
const A =
  "c__Users_iraka_AppData_Roaming_Cursor_User_workspaceStorage_4ace81455762ed0d4bb32abd18d213b2_images_";

const PROD = "/tmp";

const CASES: Case[] = [
  {
    id: "rear-clear",
    file: path.join(PROD, "bmw-prod-p1.jpg"),
    expected: "90563201",
    kind: "clear rear plate",
  },
  {
    id: "front-small",
    file: path.join(PROD, "bmw-prod-p2.jpg"),
    expected: "90563201",
    kind: "frontal plate occupying a small part of the image",
  },
  {
    id: "angled",
    file: path.join(PROD, "bmw-prod-wide.jpg"),
    expected: "90563201",
    kind: "angled rear plate",
  },
  {
    id: "rear-chat-compressed",
    file: path.join(ASSETS, `${A}image-12a6cb65-6b28-40a8-b445-7bb85c6178f0.jpg`),
    expected: "90563201",
    kind: "multiple vehicle photos / chat-compressed rear",
  },
  {
    id: "interior-no-plate",
    file: path.join(ASSETS, `${A}image-09e3272f-0c6c-4be7-9559-d5b25a4ca1f5.jpg`),
    expected: null,
    kind: "image without a readable plate",
  },
  {
    id: "ui-placeholder-numbers",
    file: path.join(ASSETS, `${A}image-54fb5bdf-959b-4b7a-b0ca-e31f6fce2fa3.png`),
    expected: null,
    kind: "UI screenshot with non-plate numbers",
  },
  {
    id: "landing-no-plate",
    file: path.join(ASSETS, `${A}image-5fc72479-5e0c-46ed-b959-188180006cc1.jpg`),
    expected: null,
    kind: "marketing image / numbers that are not a plate",
  },
  {
    id: "intake-success-ui",
    file: path.join(ASSETS, `${A}image-47b48260-4f9f-4f76-b77d-ad6254f34484.png`),
    expected: null,
    kind: "app UI without a vehicle plate",
  },
  {
    id: "review-ui-typed-plate",
    file: path.join(ASSETS, `${A}image-517da392-bf03-4ee9-8a70-613182296cd2.png`),
    expected: null,
    kind: "UI screenshot with plate-like numbers that are not a photographed plate",
  },
];

async function compressedCopy(src: string): Promise<Buffer> {
  return sharp(src)
    .jpeg({ quality: 32, mozjpeg: true })
    .resize({ width: 900 })
    .toBuffer();
}

function verdictOf(expected: string | null, got: string | null): Verdict {
  if (expected) {
    if (got === expected) return "correct";
    if (!got) return "no_result";
    return "incorrect";
  }
  return got ? "false_positive" : "no_result";
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

async function main() {
  const { extractPlateFromImageBytes } = await import(
    "../src/services/intake/plate-ocr"
  );
  const model =
    process.env.OPENAI_PLATE_OCR_MODEL ||
    process.env.OPENAI_AGENT_LOOP_MODEL ||
    "gpt-5.4-mini";

  const rows: Array<{
    id: string;
    kind: string;
    expected: string | null;
    got: string | null;
    confidence: number | null;
    latencyMs: number;
    verdict: Verdict;
  }> = [];

  for (const c of CASES) {
    if (!existsSync(c.file)) {
      throw new Error(`missing corpus file: ${c.id} ${c.file}`);
    }
    const bytes = readFileSync(c.file);
    const t0 = Date.now();
    const hint = await extractPlateFromImageBytes(bytes);
    rows.push({
      id: c.id,
      kind: c.kind,
      expected: c.expected,
      got: hint?.value ?? null,
      confidence: hint?.confidence ?? null,
      latencyMs: Date.now() - t0,
      verdict: verdictOf(c.expected, hint?.value ?? null),
    });
  }

  const rear = CASES.find((c) => c.id === "rear-clear")!;
  const t0 = Date.now();
  const wa = await extractPlateFromImageBytes(await compressedCopy(rear.file));
  rows.push({
    id: "whatsapp-compressed-rear",
    kind: "lower-quality WhatsApp/compressed image",
    expected: "90563201",
    got: wa?.value ?? null,
    confidence: wa?.confidence ?? null,
    latencyMs: Date.now() - t0,
    verdict: verdictOf("90563201", wa?.value ?? null),
  });

  const known = rows.filter((r) => r.expected);
  const none = rows.filter((r) => !r.expected);
  const summary = {
    model,
    totalKnownPlates: known.length,
    exactCorrect: known.filter((r) => r.verdict === "correct").length,
    incorrect: known.filter((r) => r.verdict === "incorrect").length,
    noResult: known.filter((r) => r.verdict === "no_result").length,
    falsePositives: none.filter((r) => r.verdict === "false_positive").length,
    trueNegatives: none.filter((r) => r.got === null).length,
    medianLatencyMs: median(rows.map((r) => r.latencyMs)),
    rows,
  };

  writeFileSync("/tmp/plate-ocr-benchmark.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

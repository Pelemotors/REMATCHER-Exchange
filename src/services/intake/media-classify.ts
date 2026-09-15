import "server-only";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolveMediaAbsolutePath } from "@/lib/media/storage";
import type { VehicleMediaCategory } from "@prisma/client";

/**
 * Provisional auto-assign threshold. Below this → leave category unset
 * for dealer review only when needed (ambiguity), never force OTHER→EXTERIOR later.
 * Recalibrate after Field Test exterior/interior confusion telemetry.
 */
export const CLASSIFY_CONFIDENCE_THRESHOLD = 0.62;

/**
 * Lightweight heuristic classification for EXTERIOR vs INTERIOR.
 * Uses brightness/edge distribution — not a substitute for vision models.
 */
export async function classifyIntakeMediaCategory(
  storageKey: string
): Promise<{ category: VehicleMediaCategory; confidence: number } | null> {
  try {
    const abs = resolveMediaAbsolutePath(storageKey);
    const buf = await readFile(abs);
    const { data, info } = await sharp(buf)
      .resize(64, 64, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let sum = 0;
    let edge = 0;
    const w = info.width;
    const h = info.height;
    for (let i = 0; i < data.length; i += 3) {
      const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += y;
    }
    const mean = sum / (data.length / 3);
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const i = (y * w + x) * 3;
        const j = (y * w + x + 1) * 3;
        const a =
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const b =
          0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
        edge += Math.abs(a - b);
      }
    }
    const edgeNorm = edge / (w * h);

    // Interiors tend to be darker with more local edges (dashboard/seats);
    // exteriors brighter with smoother sky/body regions — weak prior only.
    let result: { category: VehicleMediaCategory; confidence: number } | null =
      null;
    if (mean < 90 && edgeNorm > 8) {
      result = { category: "INTERIOR", confidence: 0.68 };
    } else if (mean > 110 && edgeNorm < 14) {
      result = { category: "EXTERIOR", confidence: 0.68 };
    }

    if (!result || result.confidence < CLASSIFY_CONFIDENCE_THRESHOLD) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

import "server-only";
import sharp from "sharp";

const MAX_BYTES = 3_500_000;
const TARGET_WIDTH = 1600;

/**
 * Downscale / re-encode so iPhone originals (often >4MB) still reach vision/OCR.
 */
export async function prepareImageForVision(
  bytes: Buffer,
  mimeType?: string
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!bytes?.length) return null;
  try {
    const out = await sharp(bytes)
      .rotate()
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    if (!out.length || out.length > MAX_BYTES) return null;
    return { bytes: out, mimeType: "image/jpeg" };
  } catch {
    if (bytes.length > MAX_BYTES) return null;
    return { bytes, mimeType: mimeType || "image/jpeg" };
  }
}

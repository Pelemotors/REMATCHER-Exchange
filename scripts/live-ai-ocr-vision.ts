/**
 * Live Production OCR + Vision against real Israeli plate photos.
 * Usage (from app root, production env already loaded by caller):
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/live-ai-ocr-vision.ts <image>
 */
import { readFileSync } from "node:fs";

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("usage: live-ai-ocr-vision.ts <image>");
    process.exit(1);
  }
  const bytes = readFileSync(imagePath);
  const { extractPlateFromImageBytes } = await import(
    "../src/services/intake/plate-ocr"
  );
  const { understandIntakeMediaSample } = await import(
    "../src/services/intake/media-vision"
  );

  const ocr = await extractPlateFromImageBytes(bytes, { mimeType: "image/jpeg" });
  const vision = await understandIntakeMediaSample(
    [{ bytes, mimeType: "image/jpeg" }],
    { maxImages: 1 }
  );

  console.log(
    JSON.stringify(
      {
        ocrPlate: ocr?.value ?? null,
        ocrConfidence: ocr?.confidence ?? null,
        visionMake: vision?.makeHint ?? null,
        visionModel: vision?.modelHint ?? null,
        visionPlate: vision?.plateDigitsHint ?? null,
        visionConfidence: vision?.confidence ?? null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

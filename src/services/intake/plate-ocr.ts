/**
 * Plate OCR from images — optional path.
 * Without an OCR engine installed, returns null (text share / dealer review remain primary).
 * Provenance source remains "OCR" when a future engine is wired.
 */
export type PlateOcrHint = {
  value: string;
  confidence: number;
  source: "OCR";
};

export async function extractPlateFromImageBytes(
  _bytes: Buffer
): Promise<PlateOcrHint | null> {
  // Field Test: no on-host OCR binary. Keep contract stable for wiring tesseract/vision later.
  return null;
}

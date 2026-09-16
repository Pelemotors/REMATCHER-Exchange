/**
 * Live: vision plate → normalize → GOV canonical identity.
 *   npx tsx --require ./scripts/register-server-only.cjs scripts/live-plate-ocr-gov.ts [image]
 */
import { readFileSync } from "node:fs";
import { normalizePlateDigits } from "../src/services/intake/plate-ocr-result";

async function main() {
  const imagePath = process.argv[2] || "/tmp/bmw-prod-p1.jpg";
  const bytes = readFileSync(imagePath);
  const { extractPlateFromImageBytes } = await import(
    "../src/services/intake/plate-ocr"
  );
  const { lookupVehicleByPlate } = await import(
    "../src/services/identity/gov-vehicle"
  );

  const ocr = await extractPlateFromImageBytes(bytes);
  const normalized = ocr?.value
    ? normalizePlateDigits(ocr.value)
    : null;
  const gov = normalized
    ? await lookupVehicleByPlate(normalized)
    : { state: "SKIPPED", identity: null };

  console.log(
    JSON.stringify(
      {
        vision: {
          plate: ocr?.value ?? null,
          confidence: ocr?.confidence ?? null,
          source: "VISION",
        },
        normalized,
        gov: {
          state: gov.state,
          source: "GOV",
          tozeret: gov.identity?.make ?? null,
          kinuy: gov.identity?.model ?? null,
          shnat_yitzur: gov.identity?.year ?? null,
          degem: gov.identity?.trim ?? null,
        },
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

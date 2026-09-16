/**
 * Visual fixtures for intake/vision tests. No real customer photos.
 * Usage: npx tsx scripts/generate-intake-fixtures.ts
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "tests/fixtures/intake");

function plateSvg(plate: string, label: string) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <rect width="1200" height="800" fill="#3a4454"/>
  <rect x="80" y="220" width="1040" height="280" rx="24" fill="#dfe3ea"/>
  <rect x="140" y="300" width="920" height="140" rx="12" fill="#f4f6f8" stroke="#1b3a6b" stroke-width="8"/>
  <text x="600" y="395" text-anchor="middle" font-size="72" font-family="Arial, sans-serif" fill="#111">${plate}</text>
  <text x="600" y="560" text-anchor="middle" font-size="36" font-family="Arial, sans-serif" fill="#f4f1ea">${label}</text>
</svg>`);
}

function chatSvg(bubbles: string[]) {
  const rows = bubbles
    .map((b, i) => {
      const y = 120 + i * 90;
      const x = i % 2 === 0 ? 40 : 160;
      const fill = i % 2 === 0 ? "#1f6b45" : "#243044";
      return `<rect x="${x}" y="${y}" width="420" height="72" rx="16" fill="${fill}"/>
      <text x="${x + 16}" y="${y + 44}" font-size="22" font-family="Arial, sans-serif" fill="#f4f1ea">${b}</text>`;
    })
    .join("\n");
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960">
  <rect width="540" height="960" fill="#0b141a"/>
  <rect width="540" height="72" fill="#075e54"/>
  <text x="24" y="46" font-size="22" font-family="Arial, sans-serif" fill="#fff">WhatsApp</text>
  ${rows}
</svg>`);
}

async function svgToJpeg(svg: Buffer, file: string, width: number) {
  const buf = await sharp(svg).resize({ width }).jpeg({ quality: 85 }).toBuffer();
  writeFileSync(join(OUT, file), buf);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const plates = [
    ["12-345-67", "vehicle-a.jpg"],
    ["98-765-43", "vehicle-b.jpg"],
    ["11-222-33", "vehicle-c.jpg"],
  ];
  for (const [plate, file] of plates) {
    await svgToJpeg(plateSvg(plate, `REMATCHER fixture ${plate}`), file, 1200);
  }
  await svgToJpeg(
    plateSvg("00-000-00", "interior no plate"),
    "interior-no-plate.jpg",
    1200
  );
  await svgToJpeg(
    chatSvg(["מחפש לאשתי CX5", "22 ומעלה", "עד 140", "עדיף לבן", "לא השכרה"]),
    "whatsapp-cx5.jpg",
    540
  );
  await svgToJpeg(
    chatSvg(["מחפש CX5", "בעצם אפשר 150", "עזוב צבע, לא משנה"]),
    "whatsapp-conflict-update.jpg",
    540
  );
  await svgToJpeg(
    chatSvg(["כזה אני מחפש", "טוסון לבן עד 160"]),
    "whatsapp-like-this.jpg",
    540
  );
  writeFileSync(
    join(OUT, "README.txt"),
    "Generated synthetic fixtures. Not customer data.\n"
  );
  console.log(`Wrote fixtures to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

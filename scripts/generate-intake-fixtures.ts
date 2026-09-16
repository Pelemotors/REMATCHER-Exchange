/**
 * Visual fixtures for intake/vision tests. No real customer photos.
 * Usage: npx tsx scripts/generate-intake-fixtures.ts
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "tests/fixtures/intake");

function plateSvg(plate: string, label: string, fill = "#3a4454") {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <rect width="1200" height="800" fill="${fill}"/>
  <rect x="80" y="220" width="1040" height="280" rx="24" fill="#dfe3ea"/>
  <rect x="140" y="300" width="920" height="140" rx="12" fill="#f4f6f8" stroke="#1b3a6b" stroke-width="8"/>
  <text x="600" y="395" text-anchor="middle" font-size="72" font-family="Arial, sans-serif" fill="#111">${plate}</text>
  <text x="600" y="560" text-anchor="middle" font-size="36" font-family="Arial, sans-serif" fill="#f4f1ea">${label}</text>
</svg>`);
}

function interiorSvg(label: string) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <rect width="1200" height="800" fill="#1a1512"/>
  <rect x="120" y="80" width="960" height="520" rx="18" fill="#2a2420"/>
  <rect x="200" y="160" width="800" height="280" rx="12" fill="#3d342c"/>
  <text x="600" y="720" text-anchor="middle" font-size="28" font-family="Arial, sans-serif" fill="#c5b8a8">${label}</text>
</svg>`);
}

function chatSvg(title: string, bubbles: string[]) {
  const rows = bubbles
    .map((b, i) => {
      const y = 120 + i * 96;
      const x = i % 2 === 0 ? 36 : 84;
      const fill = i % 2 === 0 ? "#005c4b" : "#202c33";
      const w = Math.min(470, 48 + b.length * 14);
      return `<rect x="${x}" y="${y}" width="${w}" height="80" rx="16" fill="${fill}"/>
      <text x="${x + 16}" y="${y + 48}" font-size="22" font-family="Arial, sans-serif" fill="#e9edef">${b}</text>`;
    })
    .join("\n");
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960">
  <rect width="540" height="960" fill="#0b141a"/>
  <rect width="540" height="88" fill="#1f2c34"/>
  <circle cx="48" cy="44" r="18" fill="#25d366"/>
  <text x="78" y="52" font-size="22" font-family="Arial, sans-serif" fill="#e9edef">${title}</text>
  ${rows}
</svg>`);
}

async function svgToJpeg(svg: Buffer, file: string, width: number) {
  const buf = await sharp(svg).resize({ width }).jpeg({ quality: 88 }).toBuffer();
  writeFileSync(join(OUT, file), buf);
}

const VEHICLES: Array<{ plate: string; label: string; files: string[]; fill: string }> = [
  { plate: "12-345-67", label: "Mazda CX-5", files: ["v1a.jpg", "v1b.jpg", "v1c.jpg"], fill: "#2c3a4a" },
  { plate: "98-765-43", label: "BMW X3", files: ["v2a.jpg", "v2b.jpg", "v2c.jpg"], fill: "#3a2c2c" },
  { plate: "11-222-33", label: "Toyota RAV4", files: ["v3a.jpg", "v3b.jpg"], fill: "#2c3a2c" },
  { plate: "22-333-44", label: "Kia Sportage", files: ["v4a.jpg", "v4b.jpg"], fill: "#2c2c3a" },
  { plate: "33-444-55", label: "Hyundai Tucson", files: ["v5a.jpg", "v5b.jpg"], fill: "#3a3a2c" },
  { plate: "44-555-66", label: "Skoda Kodiaq", files: ["v6a.jpg", "v6b.jpg"], fill: "#2a3340" },
  { plate: "55-666-77", label: "Volvo XC60", files: ["v7a.jpg"], fill: "#203040" },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(join(OUT, "batch16"), { recursive: true });
  mkdirSync(join(OUT, "perf"), { recursive: true });

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
    chatSvg("יוסי", ["מחפש לאשתי CX5", "22 ומעלה", "עד 140", "עדיף לבן", "לא השכרה"]),
    "whatsapp-cx5.jpg",
    540
  );
  await svgToJpeg(
    chatSvg("לקוח", ["מחפש CX5", "בעצם אפשר 150", "עזוב צבע, לא משנה"]),
    "whatsapp-conflict-update.jpg",
    540
  );
  await svgToJpeg(
    chatSvg("דני", ["כזה אני מחפש", "טוסון לבן עד 160"]),
    "whatsapp-like-this.jpg",
    540
  );
  await svgToJpeg(
    chatSvg("יוסי", ["מחפש CX5", "22 ומעלה", "עד 140", "עדיף לבן"]),
    "whatsapp-cx5-shot-1.jpg",
    540
  );
  await svgToJpeg(
    chatSvg("יוסי", ["בלי תאונות", "רצוי עד 80 אלף קמ"]),
    "whatsapp-cx5-shot-2.jpg",
    540
  );
  await svgToJpeg(
    chatSvg("יוסי", ["מתי אפשר לראות?", "אשמח היום אחהצ"]),
    "whatsapp-cx5-shot-3.jpg",
    540
  );
  await svgToJpeg(
    chatSvg("מיכל", ["מחפשת קורולה", "2020 ומעלה"]),
    "whatsapp-cx5-shot-4.jpg",
    540
  );
  await svgToJpeg(
    chatSvg("מיכל", ["עד 90 אלף", "עדיף אפור"]),
    "whatsapp-cx5-shot-5.jpg",
    540
  );

  const batch16: string[] = [];
  for (const v of VEHICLES) {
    for (const file of v.files) {
      const rel = `batch16/${file}`;
      await svgToJpeg(plateSvg(v.plate, v.label, v.fill), rel, 1200);
      batch16.push(rel);
    }
  }
  await svgToJpeg(interiorSvg("UNKNOWN interior no plate"), "batch16/unknown-interior.jpg", 1200);
  batch16.push("batch16/unknown-interior.jpg");

  for (let i = 1; i <= 30; i++) {
    const v = VEHICLES[(i - 1) % VEHICLES.length]!;
    await svgToJpeg(
      plateSvg(v.plate, `${v.label} #${i}`, v.fill),
      `perf/n${String(i).padStart(2, "0")}.jpg`,
      1000
    );
  }

  writeFileSync(
    join(OUT, "README.txt"),
    [
      "Generated synthetic fixtures. Not customer data.",
      `batch16 files (${batch16.length}): ${batch16.join(", ")}`,
      "Expected identities: 7 plates + 1 unknown interior.",
      "",
    ].join("\n")
  );
  writeFileSync(join(OUT, "batch16-manifest.json"), JSON.stringify({ files: batch16, vehicles: VEHICLES }, null, 2));
  console.log(`Wrote fixtures to ${OUT} batch16=${batch16.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import sharp from "sharp";
import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();
const svg = readFileSync(join(root, "public/icons/icon.svg"));

async function png(size, out) {
  await sharp(svg).resize(size, size).png().toFile(join(root, out));
  console.log("wrote", out);
}

async function maskable512(out) {
  const inner = 320;
  const mark = await sharp(svg).resize(inner, inner).png().toBuffer();
  const bg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#070C14"/></svg>'
  );
  await sharp(bg)
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(join(root, out));
  console.log("wrote", out);
}

await png(192, "public/icons/icon-192.png");
await png(512, "public/icons/icon-512.png");
await png(180, "public/icons/apple-touch-icon.png");
await maskable512("public/icons/icon-512-maskable.png");

/**
 * Deterministic zoom onto a yellow Israeli registration plate.
 * Vision still reads the digits; this only enlarges the plate region.
 */
import sharp from "sharp";

export type PlateCrop = {
  bytes: Buffer;
  mimeType: "image/jpeg";
  box: { left: number; top: number; width: number; height: number };
};

function hsv(r: number, g: number, b: number): {
  h: number;
  s: number;
  v: number;
} {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = 60 * (((gg - bb) / d) % 6);
    else if (max === gg) h = 60 * ((bb - rr) / d + 2);
    else h = 60 * ((rr - gg) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** Saturated Israeli private-plate yellow (not beige body paint, not grass). */
function isIsraeliPlateYellow(r: number, g: number, b: number): boolean {
  if (r < g) return false;
  const { h, s, v } = hsv(r, g, b);
  return h >= 22 && h <= 55 && s >= 0.42 && v >= 0.38;
}

/**
 * Find the largest yellow blob with a plate-like aspect ratio and return
 * an upscaled crop. Returns null if nothing plate-like is found (then OCR
 * should use the full frame).
 */
export async function cropIsraeliYellowPlate(
  bytes: Buffer
): Promise<PlateCrop | null> {
  if (!bytes?.length) return null;
  try {
    const oriented = sharp(bytes).rotate();
    const meta = await oriented.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 40 || height < 20) return null;

    const scanW = Math.min(480, width);
    const scanH = Math.max(1, Math.round((height * scanW) / width));
    const { data, info } = await oriented
      .clone()
      .resize({ width: scanW, height: scanH })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const visited = new Uint8Array(w * h);
    const yellowAt = (i: number) => {
      const o = i * info.channels;
      return isIsraeliPlateYellow(data[o]!, data[o + 1]!, data[o + 2]!);
    };

    let best: {
      count: number;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    } | null = null;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const start = y * w + x;
        if (visited[start] || !yellowAt(start)) continue;

        let count = 0;
        let minX = x;
        let minY = y;
        let maxX = x;
        let maxY = y;
        const stack = [start];
        visited[start] = 1;

        while (stack.length) {
          const cur = stack.pop()!;
          count++;
          const cx = cur % w;
          const cy = (cur / w) | 0;
          if (cx < minX) minX = cx;
          if (cy < minY) minY = cy;
          if (cx > maxX) maxX = cx;
          if (cy > maxY) maxY = cy;

          const tryPush = (nx: number, ny: number) => {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
            const n = ny * w + nx;
            if (visited[n] || !yellowAt(n)) return;
            visited[n] = 1;
            stack.push(n);
          };
          tryPush(cx - 1, cy);
          tryPush(cx + 1, cy);
          tryPush(cx, cy - 1);
          tryPush(cx, cy + 1);
        }

        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const aspect = bw / Math.max(bh, 1);
        if (count < 40) continue;
        if (aspect < 1.8 || aspect > 7.5) continue;
        if (bw < w * 0.02 || bh < h * 0.012) continue;
        if (!best || count > best.count) {
          best = { count, minX, minY, maxX, maxY };
        }
      }
    }

    if (!best) return null;

    const scaleX = width / w;
    const scaleY = height / h;
    const pad = 0.22;
    let left = Math.floor(best.minX * scaleX);
    let top = Math.floor(best.minY * scaleY);
    let cw = Math.ceil((best.maxX - best.minX + 1) * scaleX);
    let ch = Math.ceil((best.maxY - best.minY + 1) * scaleY);
    const extraX = Math.max(4, Math.round(cw * pad));
    const extraY = Math.max(4, Math.round(ch * pad));
    left = Math.max(0, left - extraX);
    top = Math.max(0, top - extraY);
    cw = Math.min(width - left, cw + extraX * 2);
    ch = Math.min(height - top, ch + extraY * 2);
    if (cw < 64 || ch < 28) return null;

    const cropped = await sharp(bytes)
      .rotate()
      .extract({ left, top, width: cw, height: ch })
      .resize({ width: 1200, withoutEnlargement: false })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    if (!cropped.length) return null;
    return {
      bytes: cropped,
      mimeType: "image/jpeg",
      box: { left, top, width: cw, height: ch },
    };
  } catch {
    return null;
  }
}

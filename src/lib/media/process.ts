import "server-only";
import sharp from "sharp";

const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const DISPLAY_LONG_EDGE = 1920;
const THUMB_LONG_EDGE = 480;

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaValidationError";
  }
}

export async function processVehicleImage(input: Buffer): Promise<{
  display: Buffer;
  thumb: Buffer;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  ext: string;
}> {
  if (!input?.length) {
    throw new MediaValidationError("EMPTY_FILE");
  }
  if (input.length > MAX_INPUT_BYTES) {
    throw new MediaValidationError("FILE_TOO_LARGE");
  }

  let pipeline = sharp(input, { failOn: "error" }).rotate();
  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new MediaValidationError("INVALID_IMAGE");
  }

  const displayBuf = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({
      width: DISPLAY_LONG_EDGE,
      height: DISPLAY_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const thumbBuf = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({
      width: THUMB_LONG_EDGE,
      height: THUMB_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 75 })
    .toBuffer({ resolveWithObject: true });

  return {
    display: displayBuf.data,
    thumb: thumbBuf.data,
    mimeType: "image/webp",
    width: displayBuf.info.width,
    height: displayBuf.info.height,
    bytes: displayBuf.data.length,
    ext: "webp",
  };
}

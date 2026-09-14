import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function getMediaRoot(): string {
  const root = process.env.MEDIA_ROOT?.trim();
  if (root) return path.resolve(root);
  return path.resolve(process.cwd(), ".media");
}

export function getMediaPublicBaseUrl(): string {
  const base = process.env.MEDIA_PUBLIC_BASE_URL?.trim();
  if (base) return base.replace(/\/$/, "");
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "");
  return app ? `${app}/api/media` : "/api/media";
}

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export function buildVehicleMediaKeyPair(params: {
  dealerId: string;
  vehicleId: string;
  ext: string;
}): { displayKey: string; thumbKey: string } {
  const token = randomBytes(16).toString("hex");
  const safeExt = params.ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const base = path.posix.join("vehicles", params.dealerId, params.vehicleId);
  return {
    displayKey: path.posix.join(base, `display-${token}.${safeExt}`),
    thumbKey: path.posix.join(base, `thumb-${token}.${safeExt}`),
  };
}

export function thumbKeyFromDisplayKey(displayKey: string): string | null {
  const replaced = displayKey.replace(/\/display-/, "/thumb-");
  return replaced === displayKey ? null : replaced;
}

export function resolveMediaAbsolutePath(storageKey: string): string {
  const normalized = storageKey.replace(/\\/g, "/");
  if (
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    normalized.includes("\0")
  ) {
    throw new Error("INVALID_STORAGE_KEY");
  }
  const abs = path.resolve(getMediaRoot(), normalized);
  const root = getMediaRoot() + path.sep;
  if (!abs.startsWith(root) && abs !== getMediaRoot()) {
    throw new Error("INVALID_STORAGE_KEY");
  }
  return abs;
}

export async function writeMediaFile(
  storageKey: string,
  bytes: Buffer
): Promise<void> {
  const abs = resolveMediaAbsolutePath(storageKey);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, bytes, { flag: "wx" });
}

export async function deleteMediaFile(storageKey: string): Promise<void> {
  try {
    const abs = resolveMediaAbsolutePath(storageKey);
    await unlink(abs);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw error;
  }
}

export function publicUrlForStorageKey(storageKey: string): string {
  const base = getMediaPublicBaseUrl();
  const encoded = storageKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/${encoded}`;
}

export function publicThumbUrlForDisplayKey(displayKey: string): string {
  const thumb = thumbKeyFromDisplayKey(displayKey);
  return publicUrlForStorageKey(thumb ?? displayKey);
}

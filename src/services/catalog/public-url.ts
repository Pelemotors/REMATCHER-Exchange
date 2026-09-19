const CATALOG_PUBLIC_HOST = "rematcher.co.il";

export function catalogPublicUrl(slug: string): string {
  return `https://${slug}.${CATALOG_PUBLIC_HOST}`;
}

export function catalogPublicVehicleUrl(slug: string, publicId: string): string {
  return `${catalogPublicUrl(slug)}/vehicles/${publicId}`;
}

export function catalogCanonicalPath(slug: string, path = ""): string {
  const suffix = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `https://${slug}.${CATALOG_PUBLIC_HOST}${suffix}`;
}

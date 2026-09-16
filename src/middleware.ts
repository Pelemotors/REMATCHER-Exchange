import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { catalogSlugFromHost } from "@/services/catalog/slug";

/** Forward pathname + search; rewrite dealer catalog hosts to `/c/{slug}…`. */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-search", request.nextUrl.search);

  const slug = catalogSlugFromHost(request.headers.get("host"));
  if (slug) {
    const path = request.nextUrl.pathname;
    // Avoid double-prefix if already under /c/
    if (!path.startsWith("/c/") && !path.startsWith("/api/")) {
      const url = request.nextUrl.clone();
      url.pathname = path === "/" ? `/c/${slug}` : `/c/${slug}${path}`;
      return NextResponse.rewrite(url, {
        request: { headers: requestHeaders },
      });
    }
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json|.*\\..*).*)",
  ],
};

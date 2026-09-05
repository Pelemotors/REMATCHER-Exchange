import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Forward pathname + search to server layouts (Privacy AI gate, login return). */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-search", request.nextUrl.search);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json|.*\\..*).*)",
  ],
};

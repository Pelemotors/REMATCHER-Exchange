import { NextResponse } from "next/server";

/** Auth routes no longer use blanket middleware rate limiting. */
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};

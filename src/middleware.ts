import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Modules temporarily hidden from the nav (owner request) — blocked here too,
 * since a hidden nav entry alone isn't access control; staff could otherwise
 * still reach the page by typing the URL. Remove an entry (and its matching
 * nav item in layout.tsx) to bring that module back.
 */
const TEMPORARILY_DISABLED_PREFIXES = ["/whatsapp-orders", "/creative"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const disabled = TEMPORARILY_DISABLED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (disabled) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/whatsapp-orders/:path*", "/creative/:path*"],
};

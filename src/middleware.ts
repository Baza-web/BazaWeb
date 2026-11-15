import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Hosts that are never a tenant subdomain: the bare app domain, "www", and
// local dev. A self-hosted single-business deployment on its own custom
// domain (the existing Docker/VPS path) also has no subdomain — that's
// expected, see resolveOrganizationForRequest() in src/lib/tenant-resolve.ts.
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api"]);

function resolveOrgSlug(host: string): string | null {
  const hostname = host.split(":")[0];
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;

  const parts = hostname.split(".");
  // Need at least "<slug>.<domain>.<tld>" — a bare domain or a domain with
  // no subdomain at all has nothing to extract.
  if (parts.length < 3) return null;

  const subdomain = parts[0];
  if (RESERVED_SUBDOMAINS.has(subdomain)) return null;
  return subdomain;
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const slug = resolveOrgSlug(host);

  const requestHeaders = new Headers(request.headers);
  if (slug) {
    requestHeaders.set("x-org-slug", slug);
  } else {
    requestHeaders.delete("x-org-slug");
  }
  // Lets server-side code (requireScopedSession in tenant-db.ts) enforce
  // plan-based access without every page passing its own module name.
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

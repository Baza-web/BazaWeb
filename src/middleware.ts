import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Labels that are never a tenant slug even when they sit directly in front
// of the configured app root (e.g. "www.saas.example.com").
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api"]);

/**
 * The hosted SaaS root, e.g. "saas.thailankagem.com" or "app.loupe.com" —
 * set NEXT_PUBLIC_APP_DOMAIN to whatever host serves this Next.js app
 * itself. A tenant then lives at "<slug>.<that root>", however many labels
 * the root itself has — deriving the slug from the root (rather than just
 * counting hostname segments) is what lets the root live on a subdomain of
 * someone's existing domain instead of needing its own bare domain.
 *
 * Self-hosted single-business deployments (the existing Docker/VPS path, or
 * local dev) leave this unset — no subdomain is ever extracted, matching
 * resolveOrganizationForRequest()'s "exactly one Organization" fallback in
 * src/lib/tenant-resolve.ts.
 */
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN;

function resolveOrgSlug(host: string): string | null {
  const hostname = host.split(":")[0];
  if (!APP_DOMAIN || hostname === APP_DOMAIN) return null;
  if (!hostname.endsWith(`.${APP_DOMAIN}`)) return null; // unrelated host — e.g. a self-hosted custom domain

  const prefix = hostname.slice(0, -(APP_DOMAIN.length + 1));
  const slug = prefix.split(".")[0];
  if (RESERVED_SUBDOMAINS.has(slug)) return null;
  return slug;
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

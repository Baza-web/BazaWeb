import "server-only";
import { headers } from "next/headers";
import { db as rawDb } from "./db";

/**
 * Figures out which Organization a request belongs to, before anyone is
 * logged in (used on /login and /signup). Two deployment shapes:
 *
 *  - Hosted SaaS: the business visits "<slug>.yourapp.com" — middleware.ts
 *    puts that slug on the "x-org-slug" header, and we look it up here.
 *  - Self-hosted (Docker/VPS on the business's own domain, or local dev):
 *    there's no subdomain, so this only works when exactly one Organization
 *    exists — which is always true for that deployment shape.
 */
export async function resolveOrganizationForRequest() {
  const h = await headers();
  const slug = h.get("x-org-slug");

  if (slug) {
    return rawDb.organization.findUnique({ where: { slug } });
  }

  const orgs = await rawDb.organization.findMany({ take: 2 });
  return orgs.length === 1 ? orgs[0] : null;
}

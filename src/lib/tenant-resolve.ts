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

/**
 * Same as resolveOrganizationForRequest(), but for login specifically: with
 * no subdomain to go on (no wildcard DNS set up yet, or local dev), fall
 * back to whichever Organization has a Staff account with this email —
 * never a security weakening, since the password is still checked
 * afterwards, just a way to find the right tenant without a subdomain.
 * Ambiguous (the same email exists in 2+ orgs) returns null, same as "not
 * found", so the caller shows one generic error either way.
 */
export async function resolveOrganizationForLogin(email: string) {
  const bySubdomain = await resolveOrganizationForRequest();
  if (bySubdomain) return bySubdomain;

  const h = await headers();
  if (h.get("x-org-slug")) return null; // a slug was given but didn't resolve — don't guess past it

  const matches = await rawDb.staff.findMany({
    where: { email: email.toLowerCase() },
    select: { organizationId: true },
    distinct: ["organizationId"],
  });
  if (matches.length !== 1) return null;

  return rawDb.organization.findUnique({ where: { id: matches[0].organizationId } });
}

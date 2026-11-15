"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireScopedSessionOrRedirect } from "@/lib/tenant-db";
import { canManageBilling } from "@/lib/rbac";
import { stripe, billingConfigured } from "@/lib/stripe";
import { PLAN_CATALOG } from "@/lib/plans";

async function origin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${h.get("host")}`;
}

export async function subscribeToPlan(planId: "lite" | "full") {
  const { session, db } = await requireScopedSessionOrRedirect();
  if (!canManageBilling(session.role)) throw new Error("Forbidden");
  if (!billingConfigured()) throw new Error("Billing isn't configured yet.");

  const organization = await db.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  const priceId = process.env[PLAN_CATALOG[planId].stripePriceEnvVar];
  if (!priceId) throw new Error(`${PLAN_CATALOG[planId].stripePriceEnvVar} is not set.`);

  const customerId =
    organization.stripeCustomerId ??
    (
      await stripe().customers.create({
        name: organization.name,
        email: session.email,
        metadata: { organizationId: organization.id },
      })
    ).id;

  if (!organization.stripeCustomerId) {
    await db.organization.update({ where: { id: organization.id }, data: { stripeCustomerId: customerId } });
  }

  const base = await origin();
  const checkoutSession = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/billing?success=1`,
    cancel_url: `${base}/billing?canceled=1`,
    client_reference_id: organization.id,
    subscription_data: { metadata: { organizationId: organization.id, planId } },
  });

  if (!checkoutSession.url) throw new Error("Stripe did not return a checkout URL.");
  redirect(checkoutSession.url);
}

export async function openBillingPortal() {
  const { session, db } = await requireScopedSessionOrRedirect();
  if (!canManageBilling(session.role)) throw new Error("Forbidden");
  if (!billingConfigured()) throw new Error("Billing isn't configured yet.");

  const organization = await db.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  if (!organization.stripeCustomerId) throw new Error("No billing account yet — subscribe to a plan first.");

  const portalSession = await stripe().billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    return_url: `${await origin()}/billing`,
  });

  redirect(portalSession.url);
}

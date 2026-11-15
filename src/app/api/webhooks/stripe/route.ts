import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe, billingConfigured } from "@/lib/stripe";
import { PLAN_CATALOG, type PlanId } from "@/lib/plans";

function planIdForPrice(priceId: string | undefined): "lite" | "full" | null {
  if (!priceId) return null;
  for (const plan of Object.values(PLAN_CATALOG)) {
    if (process.env[plan.stripePriceEnvVar] === priceId) return plan.id;
  }
  return null;
}

function statusFor(subscriptionStatus: Stripe.Subscription.Status): "ACTIVE" | "PAST_DUE" | "CANCELED" {
  if (subscriptionStatus === "active" || subscriptionStatus === "trialing") return "ACTIVE";
  if (subscriptionStatus === "past_due" || subscriptionStatus === "unpaid") return "PAST_DUE";
  return "CANCELED";
}

async function organizationIdFor(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.organizationId;
  if (fromMetadata) return fromMetadata;

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const org = await db.organization.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  return org?.id ?? null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const organizationId = await organizationIdFor(subscription);
  if (!organizationId) {
    console.error("Stripe webhook: no Organization found for subscription", subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const planId = planIdForPrice(priceId);
  const periodEndUnix = subscription.items.data[0]?.current_period_end;

  await db.organization.update({
    where: { id: organizationId },
    data: {
      stripeSubscriptionId: subscription.id,
      status: statusFor(subscription.status),
      ...(planId ? { plan: planId satisfies PlanId } : {}),
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
    },
  });
}

export async function POST(request: Request) {
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 500 });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not set." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && typeof session.subscription === "string") {
          const subscription = await stripe().subscriptions.retrieve(session.subscription);
          await syncSubscription(subscription);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = await organizationIdFor(subscription);
        if (organizationId) {
          await db.organization.update({ where: { id: organizationId }, data: { status: "CANCELED" } });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await db.organization.updateMany({
            where: { stripeCustomerId: customerId, status: "ACTIVE" },
            data: { status: "PAST_DUE" },
          });
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await db.organization.updateMany({
            where: { stripeCustomerId: customerId, status: "PAST_DUE" },
            data: { status: "ACTIVE" },
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`Stripe webhook handler failed for ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

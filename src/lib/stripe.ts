import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function billingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Throws if STRIPE_SECRET_KEY isn't set — callers only reach this after billingConfigured() is already true. */
export function stripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set — see .env.example.");
  }
  client = new Stripe(key, { apiVersion: "2026-10-28.endive" });
  return client;
}

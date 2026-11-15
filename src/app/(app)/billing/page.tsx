import { requireScopedSessionOrRedirect } from "@/lib/tenant-db";
import { canManageBilling } from "@/lib/rbac";
import { billingConfigured } from "@/lib/stripe";
import { PLAN_CATALOG, MODULE_LABELS, resolveEffectivePlan } from "@/lib/plans";
import { formatDate } from "@/lib/utils";
import { subscribeToPlan, openBillingPortal } from "./actions";
import { CheckCircle } from "@/components/icons";

const STATUS_LABELS: Record<string, string> = {
  TRIAL: "Trial",
  ACTIVE: "Active",
  PAST_DUE: "Payment failed",
  CANCELED: "Canceled",
  SUSPENDED: "Suspended",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ blocked?: string; success?: string; canceled?: string }>;
}) {
  const { session, db } = await requireScopedSessionOrRedirect();
  const { blocked, success, canceled } = await searchParams;

  const organization = await db.organization.findUniqueOrThrow({ where: { id: session.organizationId } });
  const effective = resolveEffectivePlan(organization);
  const canManage = canManageBilling(session.role);

  if (organization.plan === "self-hosted") {
    return (
      <div className="max-w-lg space-y-6">
        <h1 className="page-title">Billing</h1>
        <div className="card">
          <p className="text-sm text-stone-600">
            This is a self-hosted deployment — there&apos;s no subscription to manage here. You run your own server, so
            there&apos;s nothing to bill.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="page-title">Billing</h1>

      {success && (
        <p className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          <CheckCircle size={16} weight="fill" aria-hidden="true" />
          Subscription confirmed — thanks! It may take a few seconds to reflect below.
        </p>
      )}
      {canceled && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Checkout was canceled — your plan hasn&apos;t changed.
        </p>
      )}
      {blocked && blocked !== "expired" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {MODULE_LABELS[blocked as keyof typeof MODULE_LABELS] ?? "That feature"} needs the Full plan.
        </p>
      )}
      {blocked === "expired" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {organization.status === "TRIAL"
            ? "Your trial has ended — choose a plan below to keep going."
            : "Your subscription isn't active — choose a plan below to regain access."}
        </p>
      )}

      <div className="card space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Current status</h2>
          <span className="badge bg-stone-100 text-stone-700">{STATUS_LABELS[organization.status] ?? organization.status}</span>
        </div>
        {effective.onTrial && (
          <p className="text-sm text-stone-600">
            Trial ends in {effective.trialDaysLeft} day{effective.trialDaysLeft === 1 ? "" : "s"}
            {organization.trialEndsAt ? ` (${formatDate(organization.trialEndsAt)})` : ""}. Full access until then.
          </p>
        )}
        {organization.status === "ACTIVE" && (
          <p className="text-sm text-stone-600">
            On the {PLAN_CATALOG[organization.plan as "lite" | "full"]?.name ?? organization.plan} plan
            {organization.currentPeriodEnd ? ` — renews ${formatDate(organization.currentPeriodEnd)}` : ""}.
          </p>
        )}
        {organization.status === "PAST_DUE" && (
          <p className="text-sm text-amber-700">
            Your last payment failed. Update your card to avoid losing access.
          </p>
        )}
        {!billingConfigured() && (
          <p className="text-xs text-stone-400">
            Billing isn&apos;t configured on this deployment yet — ask an admin to set STRIPE_SECRET_KEY.
          </p>
        )}
        {organization.stripeCustomerId && billingConfigured() && canManage && (
          <form action={openBillingPortal}>
            <button type="submit" className="btn-secondary mt-2">
              Manage billing
            </button>
          </form>
        )}
      </div>

      {canManage && billingConfigured() && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Object.values(PLAN_CATALOG).map((plan) => {
            const isCurrent = organization.status === "ACTIVE" && organization.plan === plan.id;
            return (
              <div key={plan.id} className="card">
                <h3 className="font-display text-lg font-semibold text-ink-900">{plan.name}</h3>
                <p className="mt-1 text-2xl font-semibold text-ink-900">{plan.priceLabel}</p>
                <ul className="mt-4 space-y-2">
                  {plan.modules.map((m) => (
                    <li key={m} className="flex items-start gap-2 text-sm text-stone-600">
                      <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
                      {MODULE_LABELS[m]}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <span className="btn-secondary mt-5 w-full cursor-default justify-center opacity-70">
                    Current plan
                  </span>
                ) : (
                  <form action={subscribeToPlan.bind(null, plan.id)}>
                    <button type="submit" className="btn-primary mt-5 w-full justify-center">
                      {organization.stripeCustomerId ? "Switch to " + plan.name : "Subscribe"}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!canManage && (
        <p className="text-sm text-stone-500">Only the Owner can change the subscription plan.</p>
      )}
    </div>
  );
}

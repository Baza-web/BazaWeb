import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/branding";
import { TRIAL_DAYS, PLAN_CATALOG, MODULE_LABELS } from "@/lib/plans";
import {
  MagnifyingGlass,
  Diamond,
  Receipt,
  UsersThree,
  Handshake,
  Wrench,
  Truck,
  ChartLineUp,
  Storefront,
  ClockCountdown,
  ArrowRight,
  Check,
} from "@phosphor-icons/react/ssr";

const FEATURES = [
  {
    icon: Diamond,
    title: "Inventory built for gems & jewelry",
    body: "Track carat, clarity, cut, certification, metal purity and weight — not generic SKUs. Loose stones, gold, and silver pieces each get the fields that actually matter.",
  },
  {
    icon: Receipt,
    title: "Sales & invoicing",
    body: "Ring up a sale, split payments, and watch stock decrement automatically. Every sale posts straight to the ledger — no double entry.",
  },
  {
    icon: UsersThree,
    title: "Customer relationships",
    body: "Birthdays, anniversaries, and purchase history in one place, with automatic reminders so no occasion — or repeat sale — gets missed.",
  },
  {
    icon: Handshake,
    title: "Broker & consignment memos",
    body: "Issue stones on memo, track what's outstanding, and route every edit through maker-checker approval before it's final.",
  },
  {
    icon: Wrench,
    title: "Repairs & custom orders",
    body: "Intake, assign to a craftsman, and keep customers updated automatically as a repair or custom piece moves toward completion.",
  },
  {
    icon: Truck,
    title: "Purchasing & suppliers",
    body: "Raise purchase orders, record supplier payments, and see exactly what you owe — reconciled against your accounting in real time.",
  },
  {
    icon: ChartLineUp,
    title: "Accounting & reports",
    body: "Income, expenses, and net profit roll up automatically from every sale, expense, and memo — no spreadsheet reconciliation required.",
  },
  {
    icon: Storefront,
    title: "Multi-branch, one account",
    body: "Run every branch from a single login, with role-based access so a branch manager sees their branch and an Owner sees everything.",
  },
  {
    icon: ClockCountdown,
    title: "Staff, attendance & payroll-ready data",
    body: "Geofenced clock-in/out, leave requests, and sales targets — so attendance and performance data is already there when you need it.",
  },
];

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600/10">
              <MagnifyingGlass size={16} weight="fill" className="text-brand-600" aria-hidden="true" />
            </span>
            <span className="font-display text-lg font-semibold text-ink-900">{PRODUCT_NAME}</span>
          </span>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="#features" className="hidden text-sm text-stone-600 hover:text-ink-900 sm:inline">
              Features
            </Link>
            <Link href="#pricing" className="hidden text-sm text-stone-600 hover:text-ink-900 sm:inline">
              Pricing
            </Link>
            <Link href="/login" className="text-sm text-stone-600 hover:text-ink-900">
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary">
              Start free trial
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-950 bg-[radial-gradient(circle_at_50%_0%,rgba(234,184,104,0.14),transparent_60%)] px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600/20">
            <MagnifyingGlass size={30} weight="fill" className="text-brand-300" aria-hidden="true" />
          </span>
          <h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">
            The business platform built for the gem &amp; jewelry trade
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-ink-300 sm:text-lg">{PRODUCT_TAGLINE}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary w-full justify-center sm:w-auto">
              Start your free trial
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className="btn w-full justify-center border border-ink-700 bg-transparent text-ink-100 hover:bg-ink-900 sm:w-auto"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-4 text-xs text-ink-400">{TRIAL_DAYS}-day free trial. No credit card required.</p>
        </div>
      </section>

      {/* Differentiation strip */}
      <section className="border-b border-stone-200/80 bg-stone-50 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm text-stone-600">
            Generic ERPs don&apos;t know what a <span className="font-medium text-ink-900">carat</span> is. {PRODUCT_NAME} does —
            every inventory field, memo, and report is built around how jewelers and gem dealers actually work.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl font-semibold text-ink-900 sm:text-3xl">
              Everything your business runs on, in one place
            </h2>
            <p className="mt-3 text-sm text-stone-600 sm:text-base">
              From the showroom counter to the back office — one account for your whole team.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
                  <Icon size={20} className="text-brand-600" aria-hidden="true" />
                </span>
                <h3 className="section-title">{title}</h3>
                <p className="mt-1.5 text-sm text-stone-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-stone-50 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl font-semibold text-ink-900 sm:text-3xl">Simple, per-business pricing</h2>
            <p className="mt-3 text-sm text-stone-600 sm:text-base">
              Every {TRIAL_DAYS}-day trial includes everything. Pick a plan when you're ready to keep going.
            </p>
          </div>
          <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
            {Object.values(PLAN_CATALOG).map((plan) => (
              <div key={plan.id} className={`card ${plan.id === "full" ? "border-brand-300 shadow-card-hover" : ""}`}>
                {plan.id === "full" && (
                  <span className="mb-3 inline-block rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                    Most popular
                  </span>
                )}
                <h3 className="font-display text-xl font-semibold text-ink-900">{plan.name}</h3>
                <p className="mt-1 text-3xl font-semibold text-ink-900">
                  {plan.priceLabel.replace("/mo", "")}
                  <span className="text-base font-normal text-stone-500">/mo</span>
                </p>
                <ul className="mt-5 space-y-2.5">
                  {plan.modules.map((moduleKey) => (
                    <li key={moduleKey} className="flex items-start gap-2 text-sm text-stone-600">
                      <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
                      {MODULE_LABELS[moduleKey]}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-6 w-full justify-center ${plan.id === "full" ? "btn-primary" : "btn-secondary"}`}
                >
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-ink-950 px-4 py-16 text-center sm:px-6">
        <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
          Ready to run your business on {PRODUCT_NAME}?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-300">
          Set up your business and start exploring in a couple of minutes — no setup call needed.
        </p>
        <Link href="/signup" className="btn-primary mt-6 inline-flex">
          Start your free trial
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200/80 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-stone-400 sm:flex-row">
          <span>
            © {new Date().getFullYear()} {PRODUCT_NAME}. All rights reserved.
          </span>
          <span className="flex items-center gap-4">
            <Link href="/login" className="hover:text-stone-600">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-stone-600">
              Start free trial
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

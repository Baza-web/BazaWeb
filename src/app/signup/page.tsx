import Link from "next/link";
import { signUp } from "./actions";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/branding";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 bg-[radial-gradient(circle_at_50%_0%,rgba(234,184,104,0.12),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/20">
            <MagnifyingGlass size={26} weight="fill" className="text-brand-300" aria-hidden="true" />
          </span>
          <h1 className="font-display text-3xl font-semibold text-white">{PRODUCT_NAME}</h1>
          <p className="mt-1 text-sm text-ink-300">{PRODUCT_TAGLINE}</p>
        </div>
        <div className="card space-y-4">
          <h2 className="text-center text-base font-semibold text-ink-900">Start your free trial</h2>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <form action={signUp} className="space-y-4">
            <div>
              <label className="label" htmlFor="businessName">
                Business name
              </label>
              <input
                className="input"
                id="businessName"
                name="businessName"
                type="text"
                placeholder="e.g. Ceylon Gems & Jewelry"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="ownerName">
                Your name
              </label>
              <input className="input" id="ownerName" name="ownerName" type="text" required />
            </div>
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input className="input" id="email" name="email" type="email" required />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input className="input" id="password" name="password" type="password" minLength={10} required />
              <p className="mt-1 text-xs text-stone-400">At least 10 characters.</p>
            </div>
            <button type="submit" className="btn-primary w-full">
              Create your account
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-ink-400">
          Already have an account?{" "}
          <Link href="/login" className="text-brand-300 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

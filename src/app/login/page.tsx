import { login } from "./actions";
import { googleSignInConfigured } from "@/lib/google-auth";
import { Diamond } from "@phosphor-icons/react/ssr";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const showGoogle = googleSignInConfigured();

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 bg-[radial-gradient(circle_at_50%_0%,rgba(234,184,104,0.12),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/20">
            <Diamond size={26} weight="fill" className="text-brand-300" aria-hidden="true" />
          </span>
          <h1 className="font-display text-3xl font-semibold text-white">Baza ERP</h1>
          <p className="mt-1 text-sm text-ink-300">Jewelry &amp; Gem Business Suite</p>
        </div>
        <div className="card space-y-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {showGoogle && (
            <>
              <a
                href="/api/auth/google"
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    fill="#FFC107"
                    d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4c-7.5 0-13.9 4.3-17.1 10.5z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.5 26.7 36 24 36c-5.2 0-9.6-3.1-11.3-7.5l-6.6 5.1C9.9 39.6 16.4 44 24 44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2C40.5 36.5 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"
                  />
                </svg>
                Sign in with Google
              </a>
              <div className="flex items-center gap-3 text-xs text-stone-400">
                <div className="h-px flex-1 bg-stone-200" />
                or sign in with email
                <div className="h-px flex-1 bg-stone-200" />
              </div>
            </>
          )}

          <form action={login} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input className="input" id="email" name="email" type="email" required autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input className="input" id="password" name="password" type="password" required />
            </div>
            <button type="submit" className="btn-primary w-full">
              Sign in
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-ink-400">
          Ask your branch manager or admin if you don&apos;t have an account yet.
        </p>
      </div>
    </div>
  );
}

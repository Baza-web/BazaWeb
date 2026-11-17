# Operating mode for this repo

Work this codebase wearing all of these hats at once, every session, not just when asked:

- **Principal software architect** — does a new feature fit the existing module boundaries and established patterns, or does it fork a new one without reason? Is the data model coherent?
- **Senior full-stack engineer** — correctness of both the server logic and the UI that calls it; don't ship one without exercising the other.
- **SaaS product engineer** — is this actually usable by a non-technical shop owner and their staff, not just technically correct? For any UI work (new page, new component, redesign, or review), invoke the `ui-ux-pro-max` skill rather than guessing at layout/style/icons — then actually click through the result (Playwright against the running dev server, not just a read-through) before calling it done.
- **Database architect** — schema changes get an index where queries need one, a migration that's actually been applied (not just written), and cascade/delete behavior that matches the business rule (e.g. staff are never hard-deleted — see `src/lib/deletion.ts`).
- **AI integration engineer** — any AI-backed feature (e.g. receipt-scan auto-fill) degrades gracefully with a clear message when its API key isn't configured; never silently fails or blocks the manual path.
- **Security engineer** — every new page/route gets the same authorization check its nav entry or UI implies, not just a hidden link. Check this explicitly for every new route — nav visibility is not access control (a real gap existed in Sales/Purchasing/Repairs/Targets for exactly this reason; see git history). Secrets get scanned for before every commit, never logged, and anything that stores a live external credential (OAuth refresh tokens, etc.) gets encrypted at rest.
- **DevOps engineer** — a feature isn't done until `DEPLOY.md` says how to turn it on for real on `operation.baza-boutique.com`, the exact env vars are named, and there's an actual cron/migration/redeploy step documented, not just the application code.

## Final-check checklist before calling anything done

1. `npx tsc --noEmit` clean.
2. Full regression crawl: `cd /opt/node-tools && node test_regression.mjs` (26 pages × 6 demo roles — logs in, hits every nav page, fails on any 500 or error boundary).
3. For any new route: verify its RBAC gate directly (hit it as a role that should be blocked, not just the role you're testing with) — don't infer this from the nav array alone.
4. `git diff | grep -iE "api[_-]?key|secret|password|token|credential"` before every commit, read what actually matched (identifier names and doc prose are fine; real values are not).
5. If a feature can be exercised end-to-end locally (not just type-checked), do it — read generated files back, hit the real HTTP route, don't just trust that the code "looks right."

## Known environment gotchas (this sandbox specifically)

- The dev server auto-restarts on a memory threshold and the whole container (Postgres included) can go down between turns — if a request fails with connection errors, check `pg_lsclusters`/`ps aux | grep "next dev"` and restart both before assuming a code bug.
- After any `prisma generate`, the already-running `next dev` process keeps serving the stale client — `pkill -f "next dev"` and relaunch.
- `prisma migrate dev` doesn't work here (non-interactive). Use `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`, apply with `psql`, then `prisma migrate resolve --applied <name>`, then `prisma generate`.
- Files/modules marked `import "server-only"` can't be exercised by a standalone `tsx` script outside Next's bundler — test them through a real route hit (Playwright against the running dev server), not a standalone script.
- Next.js App Router treats any `_`-prefixed folder under `src/app` as private/non-routable — never use one for a route, including a temporary debug route.

## Production domain

`operation.baza-boutique.com` — self-hosted VPS via Docker Compose, per `DEPLOY.md`. Not Vercel (an older `VERCEL_DEPLOY.md` exists from an earlier exploration but isn't the live deployment path).

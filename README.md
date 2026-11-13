# Baza ERP

A self-hosted ERP / CRM / inventory system built for a gem & jewelry business
with multiple branches and staff.

## What's included

- **Inventory** — jewelry-specific fields (metal, purity, weight, gemstone,
  carat, clarity, certification), per-branch stock, photos, low-stock alerts.
- **CRM** — customer profiles, purchase history, notes & follow-up reminders.
- **Sales / invoicing** — multi-item sales, automatic stock deduction,
  printable invoices, payment tracking.
- **Accounting** — expenses, an income/expense ledger, and a profit & loss
  view per branch or company-wide.
- **Staff accounts & roles** — Owner, Admin, Branch Manager, Sales,
  Accountant, Craftsman, each scoped to their own branch except company-wide
  roles.
- **Tasks** — daily and special tasks, assignment, due dates, priority,
  comments.
- **Inbox & notifications** — direct staff-to-staff messaging, an in-app
  notification center, and browser push notifications.

## Tech stack

Next.js (App Router) + TypeScript, PostgreSQL via Prisma, server actions
instead of a separate API layer, Tailwind CSS, and Web Push (VAPID) for
notifications — no third-party SaaS dependency. Runs anywhere Docker runs.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and AUTH_SECRET at least
npx prisma migrate dev
npx tsx prisma/seed.ts        # creates the first Owner account + branch
npm run dev
```

## Deploying to your own server

See [DEPLOY.md](./DEPLOY.md) for the full step-by-step guide to running this
on a VPS with Docker, your own domain, and HTTPS.

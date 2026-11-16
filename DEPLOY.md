# Deploying Baza ERP to your own VPS

This stack is self-contained: the app, its database, and an Nginx reverse
proxy with automatic HTTPS, all run via Docker Compose on a single server.
No third-party platform account is required.

## 1. Get a server and point your domain at it

- Any VPS works (DigitalOcean, Hetzner, Linode, a cheap AWS/GCP instance,
  etc.). 2 vCPU / 4 GB RAM is comfortable for a team of 20+ across a few
  branches; even 1 vCPU / 2 GB works for a smaller team.
- Use Ubuntu 22.04 or 24.04.
- In your domain's DNS settings, create an **A record** pointing a
  subdomain (e.g. `operation.baza-boutique.com`) at the server's public IP address.
  Wait for it to propagate (`dig operation.baza-boutique.com` should show your IP).

## 2. Install Docker on the server

SSH into the server, then:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in after this
```

## 3. Get the code onto the server

```bash
git clone <your-repo-url> bazaweb
cd bazaweb
```

(Or `scp`/`rsync` the project folder if you aren't using git for this.)

## 4. Configure secrets

```bash
cp .env.example .env
nano .env
```

Fill in:

- `POSTGRES_PASSWORD` — any strong random password.
- `AUTH_SECRET` — generate with `openssl rand -base64 48`.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — generate with:
  ```bash
  npx --yes tsx -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"
  ```
  (You can leave these blank to launch without push notifications — in-app
  notifications still work either way. You can add these later and redeploy.)
- `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` / `SEED_OWNER_NAME` — the first
  account you'll log in with. **`SEED_OWNER_PASSWORD` is required** — pick a
  real, unique password yourself; the app refuses to create the account
  with no password, a short one, or a known default like `ChangeMe123!`, so
  the very first login can't be guessed. You can still change it later from
  Staff → your account.

## 5. First boot: get a TLS certificate

Nginx needs a config before it can start, and Let's Encrypt needs Nginx
running (on plain HTTP) before it can issue a certificate. Do it in this
order:

```bash
mkdir -p nginx/conf.d
cp nginx/app.http-only.conf nginx/conf.d/app.conf
sed -i 's/YOUR_DOMAIN/operation.baza-boutique.com/' nginx/conf.d/app.conf

docker compose up -d db app nginx
```

Wait ~20 seconds for the app to build and start migrations, then confirm
`http://operation.baza-boutique.com` loads the login page (it's fine that it's not
HTTPS yet).

Now request the certificate:

```bash
docker compose run --rm --entrypoint certbot certbot certonly --webroot \
  -w /var/www/certbot \
  -d operation.baza-boutique.com \
  --email you@yourbusiness.com --agree-tos --no-eff-email
```

(The `--entrypoint certbot` is required — the `certbot` service's default
entrypoint is a renewal loop, which would otherwise silently swallow this
one-off command.)

If that succeeds, switch Nginx to the HTTPS config:

```bash
cp nginx/app.ssl.conf nginx/conf.d/app.conf
sed -i 's/YOUR_DOMAIN/operation.baza-boutique.com/g' nginx/conf.d/app.conf
docker compose exec nginx nginx -s reload
docker compose up -d certbot   # starts the auto-renewal loop
```

Your team can now reach the app at `https://operation.baza-boutique.com`.

Renewing the certificate on disk doesn't make Nginx pick it up — Nginx only
re-reads certificate files on a reload. Add a weekly cron job to renew (if
due) and reload:

```bash
(crontab -l 2>/dev/null; echo "0 3 * * 0 cd $HOME/bazaweb && ./scripts/renew-cert.sh >> $HOME/baza-backups/renew.log 2>&1") | crontab -
```

## 6. First login

Sign in with the `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` from your `.env`.
Then, in order:

1. **Staff → your account** isn't self-editable yet, so for now just note
   the temporary password is meant to be shared once, not reused — create
   your real staff accounts next and treat the seed account as the
   emergency owner login.
2. **Branches** — add your other branch(es) if you have more than one.
3. **Staff** — create an account per team member with the right role:
   - **Owner / Admin** — full access to everything, every branch.
   - **Branch Manager** — full access, scoped to their own branch.
   - **Sales** — inventory, customers, sales, within their branch.
   - **Accountant** — accounting/ledger, across branches.
   - **Craftsman** — tasks and inventory status (e.g. marking repairs).
4. Share each person's email + temporary password with them directly
   (there's no self-service password reset yet — see Limitations below).

## Optional: "Sign in with Google"

Staff can sign in with their Google account instead of a password. This is
optional and additive — password login keeps working either way.

1. Go to **console.cloud.google.com** → create a project (or use an existing
   one) → **APIs & Services** → **OAuth consent screen**: set it to
   **External**, fill in an app name and your support email, and add the
   staff emails you'll use as test users (or publish it once you're ready).
2. **APIs & Services** → **Credentials** → **Create credentials** →
   **OAuth client ID** → Application type **Web application**.
3. Under **Authorized redirect URIs**, add exactly:
   ```
   https://operation.baza-boutique.com/api/auth/google/callback
   ```
   (your real domain, must match exactly, including `https://`).
4. Copy the **Client ID** and **Client secret** it gives you.
5. In your `.env` on the server, fill in:
   ```
   GOOGLE_CLIENT_ID=<the client id>
   GOOGLE_CLIENT_SECRET=<the client secret>
   GOOGLE_REDIRECT_URI=https://operation.baza-boutique.com/api/auth/google/callback
   ```
6. Redeploy: `docker compose up -d --build app`

A "Sign in with Google" button now appears on the login page automatically.
It only works for emails that already have an active Staff account in the
app — Google doesn't create accounts, it just confirms who someone is, the
same as password login does today.

## Optional: Google Drive daily backup

Connects one Google account once, so the app can upload daily backups into
a **"26. Claude Ai"** folder in that account's own Drive automatically —
using its normal 15GB storage, no re-login ever needed. This is separate
from "Sign in with Google" above (that one only confirms who someone is; it
never touches Drive), but it reuses the same Google Cloud project and OAuth
client if you've already set that up — you just need to add one more scope
and one more redirect URI to it.

1. In the same Google Cloud project (or a new one, if you skipped "Sign in
   with Google"): **APIs & Services** → **Library** → search **Google Drive
   API** → **Enable**.
2. **APIs & Services** → **OAuth consent screen** → **Data Access** → **Add
   or remove scopes** → add `.../auth/drive.file` ("See, edit, create, and
   delete only the specific Google Drive files you use with this app").
   This narrow scope means the app can only see files *it* creates — never
   the rest of that Google account's Drive.
3. **APIs & Services** → **Credentials** → open your existing OAuth client
   (the one from "Sign in with Google", if you set that up — otherwise
   create a new **Web application** OAuth client the same way) → under
   **Authorized redirect URIs**, add a *second* one, exactly:
   ```
   https://operation.baza-boutique.com/api/auth/google/drive/callback
   ```
4. In your `.env` on the server, add:
   ```
   GOOGLE_DRIVE_REDIRECT_URI=https://operation.baza-boutique.com/api/auth/google/drive/callback
   ```
   (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are the same ones from
   step 4 above — add those too if you haven't already, even if you don't
   want "Sign in with Google" itself; this feature needs them regardless.)
5. Redeploy: `docker compose up -d --build app`
6. While your Google Cloud project is still in **Testing** publishing
   status (the default), only the test users you listed in step 1 of "Sign
   in with Google" can complete this connection — add the Google account
   you intend to connect as a test user if it isn't already, or publish the
   app once you're ready for that not to matter.
7. Log in to the app as the **Owner**, go to **Settings** in the sidebar,
   and click **Connect Google Drive**. Sign in with the Google account you
   want backups to live in, and approve the permission screen (it will
   mention this app can see and manage files it creates — that's the
   `drive.file` scope from step 2, working as intended).
8. Settings will now show "Connected as ...". This finishes the connection
   itself — the daily backup job that uses it to actually upload files is
   tracked separately (see the project status for whether that part has
   shipped yet).

To switch to a different Google account later, click **Disconnect** in
Settings first (this also revokes the app's access on Google's side), then
**Connect Google Drive** again and sign in with the other account.

### Daily backup to Google Drive

Once connected (above), add this cron line to run the actual backup every
night at 2:30 AM — exports every core table (Customers, Sales, Inventory,
Suppliers & Purchase Orders, the Accounting ledger, Staff) to its own dated
`.xlsx`, archives the `uploads` folder (inventory photos/documents) into a
dated `.tar.gz`, and uploads all of it into the connected account's
**"26. Claude Ai"** folder — all using the same `CRON_TOKEN` as the other
cron jobs on this page:

```bash
(crontab -l 2>/dev/null; echo "30 2 * * * curl -s 'https://operation.baza-boutique.com/api/cron/drive-backup?token=YOUR_CRON_TOKEN'") | crontab -
```

Every day's backups are kept **forever** in that folder by default — nothing
is ever deleted automatically. If you'd rather only keep a rolling window,
set `DRIVE_BACKUP_RETENTION_DAYS` (e.g. `30`) in `.env` and anything older
than that many days will be deleted automatically on each run. If nobody
has connected Google Drive yet, this cron job simply does nothing each
night — it's safe to add before or after connecting.

This is separate from `scripts/backup.sh` (the local database/uploads
backup set up earlier in this guide) — that one protects you if something
goes wrong on the server itself; this one protects you if the whole VPS is
lost, since the copies live in your own Google account instead.

## Optional: Gmail — email clients from the app

Connects one Gmail account once, so any staff member can email a customer
straight from their profile in the app — the message is actually sent from
that real Gmail address (not a generic no-reply sender), and every email
sent is logged on the customer's page. This reuses the same OAuth client as
"Sign in with Google" and Drive above — you're adding one more scope and
one more redirect URI to it, same as the Drive section did.

1. In the same Google Cloud project: **APIs & Services** → **Library** →
   search **Gmail API** → **Enable**.
2. **APIs & Services** → **OAuth consent screen** → **Data Access** → **Add
   or remove scopes** → add `.../auth/gmail.send` ("Send email on your
   behalf"). This scope can only send — it can never read anything already
   in that Gmail account's inbox.
3. **APIs & Services** → **Credentials** → open your existing OAuth client
   → under **Authorized redirect URIs**, add a *third* one, exactly:
   ```
   https://operation.baza-boutique.com/api/auth/google/gmail/callback
   ```
4. In your `.env` on the server, add:
   ```
   GOOGLE_GMAIL_REDIRECT_URI=https://operation.baza-boutique.com/api/auth/google/gmail/callback
   ```
5. Redeploy: `docker compose up -d --build app`
6. If your project is still in **Testing** publishing status, the Google
   account you connect must be in the test users list (same as the Drive
   step).
7. Log in as the **Owner** or an **Admin**, go to **Settings**, and click
   **Connect Gmail**. Sign in with the Gmail account you want client emails
   to be sent from, and approve the permission screen.
8. Settings will show "Connected as ...". Staff can now click the email
   icon next to a customer's email address on the Customers page, or the
   **Email** button on a customer's profile, to compose and send.

To switch to a different Gmail account later, click **Disconnect** in
Settings first, then **Connect Gmail** again.

## Updating the app later

```bash
cd bazaweb
git pull
docker compose up -d --build app
```

If the update changed anything under `nginx/` (check `git log -p nginx/`),
also re-copy your config and reload: redo step 5's `cp nginx/app.ssl.conf
nginx/conf.d/app.conf` + `sed` substitution, then `docker compose up -d
nginx`. `nginx/conf.d/app.conf` is generated on the server and isn't
tracked by git, so a plain `git pull` never updates it on its own.

Migrations run automatically on container start, so this is safe to do
without extra steps. Nginx and the database are untouched.

## Backups

Everything that matters lives in two Docker volumes: `db_data` (the
database) and `uploads_data` (inventory photos). `scripts/backup.sh`
backs up both automatically, keeping the last 14 days and deleting
anything older. Backups are written to `~/baza-backups` — outside the
git repo, so they're never at risk of being committed.

**Set it up once:**

```bash
cd ~/bazaweb
./scripts/backup.sh   # run it once by hand to confirm it works
```

You should see `Backup complete.` and two files appear under
`~/baza-backups`. Then add it to cron so it runs every night at 2 AM:

```bash
(crontab -l 2>/dev/null; echo "0 2 * * * cd $HOME/bazaweb && ./scripts/backup.sh >> $HOME/baza-backups/backup.log 2>&1") | crontab -
```

Check it's there with `crontab -l`.

**To restore a backup** (e.g. after moving to a new server, or undoing a
mistake):

```bash
cd ~/bazaweb
./scripts/restore.sh ~/baza-backups/db-2026-01-15.sql.gz ~/baza-backups/uploads-2026-01-15.tar.gz
```

**Offsite copy (recommended):** backups on the same VPS protect you from
mistakes, but not from that VPS itself failing or being lost. Once you
have a destination ready (another server you control, or a cloud storage
account like Backblaze B2 via `rclone`), uncomment the matching lines at
the bottom of `scripts/backup.sh` — ask me and I'll wire it up for you.

## Daily customer birthday/anniversary reminders

Add a `CRON_TOKEN` to your `.env` (any random string — generate one the
same way as `AUTH_SECRET`), redeploy (`docker compose up -d --build app`),
then add one more cron line so it checks every day at 7 AM:

```bash
(crontab -l 2>/dev/null; echo "0 7 * * * curl -s 'https://operation.baza-boutique.com/api/cron/reminders?token=YOUR_CRON_TOKEN'") | crontab -
```

That's it — Sales staff and the Branch Manager get notified 3 days
before any of their branch's customers' birthdays or anniversaries.

## Creative Hub: auto-publishing approved posts to Instagram

The Creative Hub's content calendar can automatically post to Instagram once
a Creative schedules it, turns on "Auto-publish," and an Owner/Admin
approves it. Nothing publishes without that explicit approval. Without this
setup, everything still works — planning, scheduling, and approval — the
post just has to be posted manually from the Instagram app instead.

To turn it on:

1. In [Meta for Developers](https://developers.facebook.com/), create an
   app, add the **Instagram** product, and connect it to your Instagram
   **Business or Creator** account (it must be linked to a Facebook Page).
2. Generate a long-lived access token for that Instagram account (Meta's
   Graph API Explorer, or your app's token generation flow) with the
   `instagram_content_publish` permission.
3. Find your Instagram account's numeric user ID (the Graph API Explorer's
   `/me?fields=id` call, called with that token, returns it).
4. Add to your `.env`:
   ```bash
   NEXT_PUBLIC_APP_URL=https://operation.baza-boutique.com
   INSTAGRAM_ACCESS_TOKEN=<the long-lived token>
   INSTAGRAM_BUSINESS_ACCOUNT_ID=<the numeric ID>
   ```
5. Redeploy (`docker compose up -d --build app`), then add a cron line that
   checks every 10 minutes for approved, due posts (reuses the same
   `CRON_TOKEN` as the reminders job above):
   ```bash
   (crontab -l 2>/dev/null; echo "*/10 * * * * curl -s 'https://operation.baza-boutique.com/api/cron/publish-instagram?token=YOUR_CRON_TOKEN'") | crontab -
   ```

Meta's long-lived tokens expire after about 60 days and need refreshing —
there's no automatic renewal here, so put a reminder on your own calendar.

## Staff attendance: clock in/out and on-site enforcement (geofencing)

Everyone with a staff account clocks in and out from the header button —
**except the Owner**, who never sees that button and can't clock in (Admin
and every other role must, same as anyone else). Every clock-in/out records
the staff member's device location (shown to managers as a "Map" link on the
Attendance page) and **requires them to be physically at the branch**:

1. Go to **Branches** (Owner/Admin only) and find the branch's "Clock-in
   location" section.
2. Click **Use my location** while standing at the branch, or click the
   spot on the map (see below), set a **radius** in meters (e.g. `100`),
   and **Save**.
3. From then on, staff at that branch must be within that radius to clock in
   or out — otherwise they get an error naming how far away they are. A
   branch with no location set yet blocks clock-in entirely, with a message
   telling staff to ask an Owner/Admin to set one — there's no way to skip
   the location check.

Geolocation requires the staff member's browser to allow location access,
and (outside of `localhost`) only works over HTTPS, which your deployment
already has.

### Picking the location on a map

The Branches page can show an interactive Google Map for setting a branch's
clock-in location (click or drag the pin, see the radius circle live)
instead of typing latitude/longitude by hand. Add
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to your `.env` — get a key at
[console.cloud.google.com](https://console.cloud.google.com), enabling the
"Maps JavaScript API" and restricting the key to your domain — then
redeploy (`docker compose up -d --build app`). Leave it blank and the plain
number fields keep working exactly as before.

### Correcting a clock in/out record

Only the **Owner** can edit or delete an attendance record (a missed
clock-out, a wrong time) — not even Admin. On the Attendance page's team
table, the Owner sees **Edit**/**Delete** on every row; everyone else sees a
read-only history.

## Staff Groups (for projects worked on by several people)

**Groups** (Owner/Admin/Manager) lets you put several staff into a named
group — e.g. a 3-person custom-order team. When assigning a task, choose
the group instead of one person: every member sees it on their own board and
any of them can update its status or comment, so the whole team stays in
sync on one shared card instead of duplicating the task.

## Sales Targets

**Targets** (Owner/Admin/Manager) lets you set a revenue goal for a sales
staff member over a date range (e.g. a calendar month). Progress is
calculated live from their recorded sales, so it updates the moment a new
sale comes in — no manual recalculation needed. Sales staff see their own
progress bar and days remaining; managers see the whole team's.

## Brokers & Memos

**Brokers & Memos** (Owner/Admin only — this is deliberately tighter than
other inventory access, since a memo sends real stock out the door) is
for stones and jewelry given to a broker on consignment:

1. Add the broker once (name, phone, email).
2. Issue a memo: pick the broker and the items they're taking. This
   removes that stock from what's sellable (same as a sale would), marks
   the item **Consignment** if that was the last unit, and — if you've set
   up email below — emails the broker an `.xlsx` statement of everything
   currently with them.
3. When stones come back, open the broker's page and **propose a return**.
   This doesn't take effect immediately: it needs a **different** Owner or
   Admin to approve it first (you can't approve your own proposal) — a
   second set of eyes on stock leaving/returning. Once approved, the stock
   returns to sellable inventory and the broker's statement is re-emailed
   automatically. Rejecting a proposal changes nothing.

**To enable the emailed statement:** add `RESEND_API_KEY` to your `.env`
(a free account at [resend.com](https://resend.com) works — the statement
emails from `onboarding@resend.dev` by default, which only verified
Resend accounts' own email can receive; verify your own sending domain in
the Resend dashboard and set `EMAIL_FROM` to send from your business's
address instead). Leave it blank to skip this — memos and approvals still
work fully, the broker just won't get an automatic email; you can still
open their page and click **Email statement now** once it's configured.

Note: "statement" here is a real `.xlsx` spreadsheet generated on each
send, not a Google Sheet — no Google Drive/Sheets account or setup is
needed for this feature.

## AI scanning (Accounting + Sales)

On the **Accounting** page, "Record an expense" has a **Scan a receipt**
box: upload a photo of a receipt/invoice, or paste the text of an order
email, and it fills in the amount, category, description, and date for
you to check before saving.

On the **New Sale** page, a matching **Scan an order** box reads a
screenshot (or pasted text) of a WhatsApp order — the way the business
actually takes orders — and tries to match the customer and each item
against your real Customers and Inventory, filling in the customer,
item lines, discount, amount paid, payment method, and notes. If an
item or customer can't be matched (new customer, item worded
differently than in Inventory), it says so and leaves that one for you
to add by hand — it never guesses an item into the sale. Either way,
**nothing is saved until you review it and click Record sale/Add
expense yourself.**

To enable both, add `ANTHROPIC_API_KEY` to your `.env` (get one at
[console.anthropic.com](https://console.anthropic.com)), then redeploy:
`docker compose up -d --build app`. Leave it blank and the Scan buttons
still appear but explain it isn't set up yet — typing things in by hand
always works either way. Each scan costs a small amount against your
Anthropic account (a few cents at most); there's no other setup needed.

## Demo data (optional, for testing navigation)

To click through the whole app with realistic sample data instead of
empty pages — customers, inventory, sales, expenses, tasks, repairs,
purchase orders, staff groups, sales targets, a broker memo, and a few
inventory items/sales tagged to specific brands — run:

```
docker compose exec app node_modules/.bin/tsx prisma/demo-data.ts
```

It creates 5 demo staff accounts (one of each role, password `Demo@12345`
for all) so you can log in and see what each role actually sees, plus
sample records across every module. It never touches your real Owner
account, is safe to run on a live system, and running it twice is a
no-op (it checks for `admin.demo@example.com` first). Everything it
creates is tagged "Demo" — staff emails end in `@example.com`, inventory
SKUs start with `DEMO-` — so it's easy to tell apart from real data.
There's no one-click removal once it's there (the records reference each
other), so only run it if you're fine leaving it in for a while, or ask
for a cleanup script when you want it gone.

## Accounting cross-check demo data (for QA / accounts-team handover)

To exercise every Accounting feature — auto-posting, Trial Balance,
Balance Sheet, Cash Flow, AR/AP aging, Bank Reconciliation — with
realistic numbers under the Baza Boutique and Maison Dor brands before
handing the system to your accounts team, run:

```
docker compose exec app node_modules/.bin/tsx prisma/accounting-demo-data.ts
```

This creates, per brand: 10 customers, 10 inventory items, 10 sales
(mixed PAID/PARTIAL/UNPAID, spread across every AR aging bucket), and 10
expenses (one per expense category) — plus, not brand-specific: 10
suppliers, 10 purchase orders (mixed payment status, spread across AP
aging buckets), 10 manual journal entries, and 10 bank statement lines
on the Bank account (6 with a real match waiting in Bank Reconciliation,
4 deliberately unmatched, so the team can practice both the match and
the "no match found" paths). Running it twice is a no-op (it checks for
a customer on `@acct-demo.test` first).

Everything it creates is tagged `[ACCT-DEMO]` in notes/descriptions, with
emails ending in `@acct-demo.test` and inventory SKUs starting with
`ACCTDEMO-` — unmistakably test data. When you're done cross-checking
and ready to hand over a clean system, remove all of it with:

```
docker compose exec app node_modules/.bin/tsx prisma/accounting-demo-cleanup.ts
```

This hard-deletes everything the seed script created (restocking the
demo inventory first) — safe because none of it was ever a real
financial record. It only ever matches by the `[ACCT-DEMO]` tag, never
by date or id range, so it can't touch anything else.

## Where things live

| What | Where |
|---|---|
| Database | Docker volume `db_data` |
| Inventory photos | Docker volume `uploads_data`, served from `/uploads/...` |
| TLS certificates | Docker volume `certbot_conf` |
| App logs | `docker compose logs -f app` |

## Limitations to know about (v1)

- No self-service "forgot password" — an Owner/Admin resets a teammate by
  creating a fresh account for now, or you can add a reset flow later.
- Email isn't wired up (no SMTP) — all notifications are in-app or push,
  not email. Add an email provider later if you want that too.
- Currency is a single ISO code (`CURRENCY` in `.env`) for the whole
  business, not per-branch.

None of these are hard to add — they just weren't needed for a first
working version. Ask for any of them whenever your team needs it.

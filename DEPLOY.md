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
  subdomain (e.g. `erp.yourbusiness.com`) at the server's public IP address.
  Wait for it to propagate (`dig erp.yourbusiness.com` should show your IP).

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
sed -i 's/YOUR_DOMAIN/erp.yourbusiness.com/' nginx/conf.d/app.conf

docker compose up -d db app nginx
```

Wait ~20 seconds for the app to build and start migrations, then confirm
`http://erp.yourbusiness.com` loads the login page (it's fine that it's not
HTTPS yet).

Now request the certificate:

```bash
docker compose run --rm --entrypoint certbot certbot certonly --webroot \
  -w /var/www/certbot \
  -d erp.yourbusiness.com \
  --email you@yourbusiness.com --agree-tos --no-eff-email
```

(The `--entrypoint certbot` is required — the `certbot` service's default
entrypoint is a renewal loop, which would otherwise silently swallow this
one-off command.)

If that succeeds, switch Nginx to the HTTPS config:

```bash
cp nginx/app.ssl.conf nginx/conf.d/app.conf
sed -i 's/YOUR_DOMAIN/erp.yourbusiness.com/g' nginx/conf.d/app.conf
docker compose exec nginx nginx -s reload
docker compose up -d certbot   # starts the auto-renewal loop
```

Your team can now reach the app at `https://erp.yourbusiness.com`.

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
   https://erp.yourbusiness.com/api/auth/google/callback
   ```
   (your real domain, must match exactly, including `https://`).
4. Copy the **Client ID** and **Client secret** it gives you.
5. In your `.env` on the server, fill in:
   ```
   GOOGLE_CLIENT_ID=<the client id>
   GOOGLE_CLIENT_SECRET=<the client secret>
   GOOGLE_REDIRECT_URI=https://erp.yourbusiness.com/api/auth/google/callback
   ```
6. Redeploy: `docker compose up -d --build app`

A "Sign in with Google" button now appears on the login page automatically.
It only works for emails that already have an active Staff account in the
app — Google doesn't create accounts, it just confirms who someone is, the
same as password login does today.

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

## Requiring staff to be on-site to clock in/out (geofencing)

Every clock-in/out already records the staff member's device location (shown
to managers as a "Map" link on the Attendance page). To also *require* staff
to be physically at the branch:

1. Go to **Branches** (Owner/Admin only) and find the branch's "Clock-in
   location" section.
2. Click **Use my location** while standing at the branch (or type in the
   coordinates), set a **radius** in meters (e.g. `100`), and **Save**.
3. From then on, staff at that branch must be within that radius to clock in
   or out — otherwise they get an error naming how far away they are.

Leave all three fields blank to turn the requirement back off for a branch;
location is still recorded either way. Geolocation requires the staff
member's browser to allow location access, and (outside of `localhost`)
only works over HTTPS, which your deployment already has.

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

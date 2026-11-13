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
  account you'll log in with. **Change this password after your first
  login** — go to Staff → your account.

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
docker compose run --rm certbot certonly --webroot \
  -w /var/www/certbot \
  -d erp.yourbusiness.com \
  --email you@yourbusiness.com --agree-tos --no-eff-email
```

If that succeeds, switch Nginx to the HTTPS config:

```bash
cp nginx/app.ssl.conf nginx/conf.d/app.conf
sed -i 's/YOUR_DOMAIN/erp.yourbusiness.com/g' nginx/conf.d/app.conf
docker compose exec nginx nginx -s reload
docker compose up -d certbot   # starts the auto-renewal loop
```

Your team can now reach the app at `https://erp.yourbusiness.com`.

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

Migrations run automatically on container start, so this is safe to do
without extra steps. Nginx and the database are untouched.

## Backups

Everything that matters lives in two Docker volumes: `db_data` (the
database) and `uploads_data` (inventory photos). Back up the database
regularly:

```bash
docker compose exec db pg_dump -U baza baza > backup-$(date +%F).sql
```

Consider putting that in a daily cron job and copying the result off the
server (e.g. to S3, Backblaze, or another machine).

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

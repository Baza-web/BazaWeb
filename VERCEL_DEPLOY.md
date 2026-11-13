# Deploying Baza ERP to Vercel + Neon

This path needs **no terminal, no SSH, no server to maintain** — everything
happens by clicking through two websites in your phone's browser. HTTPS is
automatic. This is the easier alternative to the VPS/Docker setup in
`DEPLOY.md`.

## 1. Create a free database on Neon

1. Go to **neon.tech** → sign up (you can use "Continue with GitHub")
2. Create a new project (any name, e.g. "baza-erp")
3. On the project dashboard, find the **Connection string** (sometimes under
   "Connect" or shown right on the dashboard). Copy it — it looks like:
   ```
   postgresql://user:password@ep-something.neon.tech/neondb?sslmode=require
   ```
   Keep this somewhere safe — you'll paste it into Vercel in a minute.

## 2. Import the project into Vercel

1. Go to **vercel.com** → sign up / log in with **GitHub** (use the same
   GitHub account that owns the `Baza-web/BazaWeb` repo, or make sure
   Vercel is given access to it during sign-in)
2. Click **Add New** → **Project**
3. Find and **Import** the `Baza-web/BazaWeb` repository
4. Before deploying, open **Configure Project**:
   - **Branch**: set it to `claude/brave-johnson-3cyore` (that's where the
     app lives right now)
   - **Build Command**: override it to:
     ```
     npx prisma generate && npx prisma migrate deploy && npm run build
     ```
     (this makes sure your database tables get created automatically on
     every deploy)

## 3. Add environment variables

Still on that same "Configure Project" screen (or in **Settings →
Environment Variables** after the first deploy), add these:

| Name | Value |
|---|---|
| `DATABASE_URL` | the connection string you copied from Neon |
| `AUTH_SECRET` | a long random string — ask Claude to generate one for you, or run `openssl rand -base64 48` |
| `SETUP_TOKEN` | another random string, same way — this one just protects the one-time setup URL below |
| `NEXT_PUBLIC_CURRENCY` | `USD` (or your currency code) |
| `SEED_OWNER_EMAIL` | `bazaboutiquelk@gmail.com` |
| `SEED_OWNER_PASSWORD` | pick your own real password here |
| `SEED_OWNER_NAME` | `Business Owner` (or your name) |
| `SEED_BRANCH_NAME` | `Main Branch` |

Never commit real secret values into this file or anywhere in the repo —
they only belong in Vercel's Environment Variables screen.

**If you already set up "Sign in with Google" on the VPS**, add those same
three `GOOGLE_...` variables here too — they don't need to change, since the
domain is staying the same.

## 4. Enable photo storage

1. In your Vercel project, go to the **Storage** tab
2. Create a new **Blob** store, any name
3. **Connect** it to this project — Vercel automatically adds the
   `BLOB_READ_WRITE_TOKEN` variable for you, no copying needed

## 5. Deploy

Click **Deploy**. Wait for it to finish (a few minutes). You'll get a URL
like `bazaweb-xyz.vercel.app` — open it to confirm the login page loads.

## 6. Create your first account

Visit this URL once in your browser (replace with your real Vercel URL and
the exact `SETUP_TOKEN` value you set above):

```
https://bazaweb-xyz.vercel.app/api/setup?token=<your SETUP_TOKEN value>
```

It should respond with a short message confirming your Owner account and
branch were created. Visiting it again later does nothing (it's safe to
bookmark and ignore).

## 7. Point your domain at it

1. In Vercel, go to your project → **Settings** → **Domains** → add
   `operation.baza-boutique.com`
2. Vercel will show you a DNS record to add (usually a `CNAME` pointing
   `operation` at `cname.vercel-dns.com`)
3. Go back to **Hostinger → DNS records** (same place you added the `A`
   record before) and **edit** that `operation` record: change its type to
   `CNAME` and its value to whatever Vercel showed you (delete the old `A`
   record pointing at the VPS IP if it won't let you have both)
4. Wait a few minutes, then visit `https://operation.baza-boutique.com` —
   it should now load over HTTPS automatically, with a padlock, no "Not
   Secure" warning, and logins should stay logged in when you click around.

## Updating the app later

Just push to the `claude/brave-johnson-3cyore` branch (or have me do it) —
Vercel redeploys automatically on every push. No commands to run on your
end.

## What about the VPS?

You can leave it running as a backup, or shut it down once you've confirmed
everything works on Vercel — your choice, no rush either way.

# Deploying ZHF Hub

Recommended setup: **Vercel** (hosting) + **Neon** (PostgreSQL) + **Stripe** + **Resend**.
It needs no servers to manage and costs roughly $20–45/month at ZHF's size (see
`02-solution-overview.md`). An **Azure** alternative is at the end for keeping everything in
ZHF's Microsoft tenant.

Plan for two environments:

| | Staging (first) | Production (at cutover) |
|---|---|---|
| URL | `zhf-hub.vercel.app` (or `hub-staging.zacharyhortonfoundation.org`) | `my.zacharyhortonfoundation.org` |
| Database | Neon branch `staging` | Neon branch `main` |
| Stripe | **test** keys | **live** keys |
| Data | migrated copy for rehearsal | final migration |

---

## 0. Accounts you need (ZHF should own all of them)

- [ ] **GitHub** organization or account for the code
- [ ] **Vercel** team (Pro plan for a nonprofit org with staff users)
- [ ] **Neon** project — region **US West 2 (Oregon)**, closest to Vercel `sfo1`
- [ ] **Stripe** — the ZHF account (confirm whether AHA used it; see `03-migration-plan.md`).
      Apply for Stripe's discounted nonprofit pricing.
- [ ] **Resend** — for receipts and notifications
- [ ] Access to the **DNS** for `zacharyhortonfoundation.org`

## 1. Put the code on GitHub

The project folder is already a git repository with an initial commit on `main` (the app is in
`zhf-hub/`, documentation in `docs/`). Create an empty **private** repository on GitHub, then from
the project folder:

```powershell
git remote add origin https://github.com/<org>/zhf-hub.git
git push -u origin main
```
`.gitignore` excludes `.env`, local databases and build output, so no secrets are pushed.
GitHub Actions (`.github/workflows/ci.yml`) type-checks and builds every push.

## 2. Create the database (Neon)

1. Create the project, then copy **two** connection strings from *Connection details*:
   - **Pooled** (host contains `-pooler`) → used by the app. Append `&pgbouncer=true&connect_timeout=15`.
   - **Direct** (no `-pooler`) → used for schema changes and the setup script.
2. From your computer, create the tables and the first admin (uses the **direct** string):

```powershell
cd zhf-hub
$env:DATABASE_URL = "postgresql://…direct…?sslmode=require"
$env:ADMIN_EMAIL  = "you@zacharyhortonfoundation.org"
$env:ADMIN_NAME   = "Your Name"
npm run db:deploy     # creates/updates tables
npm run db:init       # email templates, donor levels, default fund & campaign, programs, skills, badges, first admin
```
`db:init` prints a one-time temporary password if you didn't set `ADMIN_PASSWORD`. Sign in and
change it right away. **Never run `db:seed` / `db:reset` here** — they load fake data and wipe the
database (the seed refuses to run against PostgreSQL unless forced).

## 3. Create the Vercel project

1. *Add New → Project* → import the GitHub repo. **Root directory: `zhf-hub`.** Framework: Next.js
   (detected). Build command: default (`npm run build`).
2. *Settings → Environment Variables* (Production; repeat for Preview with staging values):

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** string (with `pgbouncer=true`) |
| `AUTH_SECRET` | output of `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `APP_URL` | `https://my.zacharyhortonfoundation.org` (staging: the vercel.app URL) |
| `ORG_TIMEZONE` | `America/Los_Angeles` |
| `CRON_SECRET` | another long random string |
| `STRIPE_SECRET_KEY` | `sk_test_…` on staging, `sk_live_…` in production |
| `STRIPE_WEBHOOK_SECRET` | from step 4 |
| `RESEND_API_KEY` | from step 5 |
| `EMAIL_FROM` | `Zachary Horton Foundation <hello@zacharyhortonfoundation.org>` |

3. Deploy. Open `https://<url>/api/health` → `{"ok":true,"db":"up"}`.
   Check *Logs* for lines starting `[ZHF Hub config]` — they list anything misconfigured.
4. The daily reminder job is already declared in `vercel.json` (15:00 UTC ≈ 7–8 AM Pacific).
   Vercel sends `CRON_SECRET` automatically.

## 4. Stripe

1. *Developers → Webhooks → Add endpoint*: `https://<url>/api/stripe/webhook`
   Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the **signing secret** into `STRIPE_WEBHOOK_SECRET`.
2. *Settings → Branding*: upload the ZHF logo, brand color `#33506B`, so the checkout page matches.
3. *Settings → Payment methods*: enable cards, Apple Pay, Google Pay, Link and (optionally) ACH.
4. On staging, test with card `4242 4242 4242 4242`: a one-time gift, a monthly gift, a paid event
   ticket. Each must turn into a **Succeeded** gift / **Paid** order within seconds (that proves the
   webhook works). Then refund them from the console.
5. Do the same in live mode at cutover with a real $5 gift, and refund it.

## 5. Email (Resend)

1. *Domains → Add* `zacharyhortonfoundation.org` (or a sub-domain like `mail.zacharyhortonfoundation.org`).
2. Add the DNS records Resend shows (SPF/DKIM TXT, and MX for the bounce sub-domain) at the DNS
   host, wait for **Verified**.
3. Create an API key → `RESEND_API_KEY`. Send a test from *Admin → Email templates → Save & send me a test*.
4. Check the outbox (*Admin → Email outbox*) shows **Sent**, not **Logged**.

## 6. Domain cutover

Only on cutover day (see `03-migration-plan.md`):
1. Vercel *Settings → Domains* → add `my.zacharyhortonfoundation.org`.
2. At the DNS host change the `my` record to `CNAME cname.vercel-dns.com` (remove the old Power
   Pages record). HTTPS is issued automatically within minutes.
3. Old portal links redirect automatically: `/Donate/`, `/donations/`, `/VolunteerHome/…`,
   `/events/event-details/?id=…` and `/VolunteerHome/opportunity-details/?id=…` (old IDs map to the
   migrated records).

## 7. Go-live checklist

- [ ] `/api/health` OK; no `[ZHF Hub config] ERROR` lines in the logs
- [ ] Real staff accounts created; nobody uses shared logins; demo accounts don't exist
- [ ] Settings → Organization: legal name, **EIN**, address, receipt footer reviewed
- [ ] Donation form presets, funds and the default campaign reviewed
- [ ] Email templates reviewed by ZHF (wording, signature)
- [ ] Live Stripe test gift → receipt email arrives → refunded
- [ ] Event RSVP → ticket email with QR → check-in works on a phone
- [ ] Volunteer apply → approve → sign up → log hours → approve → badge email
- [ ] Data migration reconciled (counts and totals — `03-migration-plan.md`)
- [ ] Uptime monitor on `/api/health` (UptimeRobot / Better Stack, free tiers)
- [ ] Neon point-in-time restore enabled (default 7 days on paid plans)
- [ ] Main website buttons point to `/donate`, `/events`, `/volunteer`

## 8. Day-to-day operations

| Task | Where |
|---|---|
| Add / deactivate staff, change roles | Admin → Settings → Staff accounts |
| Change receipt wording, reminders | Admin → Email templates |
| New fund or campaign | Admin → Campaigns & funds |
| Volunteer can't sign in | Constituent → Volunteering → *Email set-password link* |
| Schema change after a code update | `npm run db:deploy` with the direct URL, then redeploy |
| Restore data | Neon → Branches → restore to a point in time |
| Rotate a secret | Change it in Vercel → redeploy (changing `AUTH_SECRET` signs everyone out) |

---

## Alternative: Microsoft Azure

Use this if ZHF prefers everything under its Microsoft 365 tenant.

| Piece | Azure service | Size |
|---|---|---|
| Database | Azure Database for PostgreSQL — Flexible Server | Burstable B1ms, 32 GB |
| App | Azure App Service (Linux) **or** Azure Container Apps, running the `Dockerfile` | B1 / consumption |
| Images | Azure Container Registry (Basic) | — |
| Daily job | Logic App (Recurrence → HTTP GET `/api/cron/daily` with `Authorization: Bearer <CRON_SECRET>`) or a scheduled GitHub Action | — |

Steps:
1. Create the PostgreSQL server (allow Azure services; require SSL). Run `npm run db:deploy` and
   `npm run db:init` from your computer with its connection string.
2. Build and push the image: `az acr build -r <registry> -t zhf-hub:latest zhf-hub`.
3. Create the Web App for Containers from that image; add the same environment variables as
   *App settings* (plus `WEBSITES_PORT=3000`). Health check path: `/api/health`.
4. Custom domain + free managed certificate for `my.zacharyhortonfoundation.org`.
5. Stripe, Resend and the go-live checklist are identical to the Vercel steps.

# ZHF Hub

Donations, events and volunteer management for the **Zachary Horton Foundation** — a
modern replacement for the AHA Apps "Aha Impact" system (Dynamics 365 + Power Pages).

- **Public site** (replaces `my.zacharyhortonfoundation.org`): donate, events & tickets, volunteer
  opportunities, volunteer application and portal.
- **Staff console** (`/admin`, replaces the Dynamics back office): dashboard, constituents CRM,
  donations, recurring gifts, campaigns & funds, events & check-in, volunteers, email templates,
  reports, data import and settings.

See `../docs/` for the discovery notes, solution overview and migration plan.

---

## Quick start (local)

Requires Node.js 20+.

```powershell
cd zhf-hub
npm install
copy .env.example .env      # then set AUTH_SECRET (see the comment in the file)
npm run setup               # creates the SQLite database and loads sample data
npm run dev                 # http://localhost:3000
```

`npm run db:reset` wipes the local database and reloads the sample data at any time.

### Development logins (sample data only)

| Who | Where | Email | Password |
|---|---|---|---|
| Admin | `/login` | `admin@zhf.test` | `ZhfAdmin!2026` |
| Volunteer coordinator | `/login` | `coordinator@zhf.test` | `ZhfCoord!2026` |
| Volunteer (portal) | `/volunteer/login` | `maria.lopez@example.com` | `Volunteer!2026` |

These exist only in the seeded sample database. **Never** seed production with them — create real
staff accounts in *Settings → Staff accounts* and delete the samples.

All people in the sample data are fictional. Campaigns, events, programs, skills, badges and the
email templates mirror what ZHF had configured in AHA.

---

## Payments & email: demo mode vs live

| | Not configured (default) | Configured |
|---|---|---|
| **Stripe** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) | *Demo mode*: checkouts complete instantly, records flagged **Test** | Stripe Checkout (cards, Apple/Google Pay, ACH), recurring gifts as Stripe subscriptions, refunds from the console |
| **Resend** (`RESEND_API_KEY`, `EMAIL_FROM`) | Emails are written to *Email outbox* only | Emails are delivered and also logged in the outbox |

Stripe webhook: `https://<domain>/api/stripe/webhook` with events `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`,
`customer.subscription.updated`, `customer.subscription.deleted`.

Daily reminders: call `GET /api/cron/daily` once a day with header
`Authorization: Bearer <CRON_SECRET>` (Vercel Cron, Azure Logic App, GitHub Action…). It sends the
event reminders (7 days / 1 day), shift reminders (3 days / 1 day) and the follow-up emails.

---

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `file:./dev.db` locally; Supabase PostgreSQL in production (pooler URL ending `&schema=zhf`) |
| `AUTH_SECRET` | yes | 48+ random bytes; signs staff/volunteer sessions and statement links |
| `APP_URL` | yes | Public URL, e.g. `https://my.zacharyhortonfoundation.org` |
| `ORG_TIMEZONE` | no | Defaults to `America/Los_Angeles`; all dates are shown/entered in this zone |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for live payments | Use the ZHF-owned Stripe account |
| `RESEND_API_KEY`, `EMAIL_FROM` | for live email | Verify the sending domain (SPF/DKIM) in Resend |
| `CRON_SECRET` | for reminders | Any long random string |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` | only for `db:init` | Creates the first administrator |

---

## Going to production

Full step-by-step guide: **[`../docs/04-deployment.md`](../docs/04-deployment.md)** (Vercel + Supabase,
or Azure). In short:

1. **Database:** set `DATABASE_URL` to PostgreSQL. The schema switches engine automatically
   (`scripts/prisma-provider.mjs`) — SQLite locally, PostgreSQL in production, same code.
   Text search is case-insensitive on both.
2. **Create tables + first admin** (from your computer, with the Supabase *session pooler* string;
   `db:deploy` also locks Supabase's public Data API out of the tables):
   `npm run db:deploy` then `ADMIN_EMAIL=… ADMIN_NAME=… npm run db:init`.
   Never run `db:seed`/`db:reset` against production (the seed refuses unless forced).
3. **Host:** Vercel (`vercel.json` includes the daily cron) or any Docker host (`Dockerfile`,
   standalone output). Health check: `/api/health`.
4. **Secrets:** see the table above. Misconfiguration is reported at startup in the logs as
   `[ZHF Hub config] …`.
5. **Stripe, Resend, domain:** see the guide. Old Power Pages URLs (`/Donate/`, `/VolunteerHome/…`,
   `…/event-details/?id=…`) redirect to the new pages automatically.
6. **Migrate data:** `../docs/03-migration-plan.md` and `scripts/migrate-from-dynamics.ts`.
7. **Images:** event/opportunity images are referenced by URL (e.g. the WordPress media library).

Built-in protections: security headers, `noindex` on admin pages, robots/sitemap, sign-in lockout
after 5 failed attempts (15 min), signed http-only session cookies, Stripe webhook signature check.

---

## Project layout

```
prisma/
  schema.prisma          data model (money in cents; enum-like fields are strings)
  seed.ts                sample data   ·   email-templates.ts   default email wording
scripts/
  migrate-from-dynamics.ts   Dataverse → ZHF Hub migration (--inspect / dry run / --commit)
src/
  app/(public)/          public site: /, /donate, /events, /volunteer
  app/admin/             staff console
  app/api/               stripe webhook, daily cron, calendar (.ics)
  app/statement/[token]  donor-facing year-end statement (signed link)
  components/            ui.tsx (design system), client-ui.tsx, feature components
  lib/                   db, auth, payments, email, donations, events, volunteers, rollups…
public/brand/zhf-logo.png   official logo
```

### Roles

| Role | Access |
|---|---|
| Administrator | Everything, including settings, staff accounts, imports, refunds, deletes |
| Staff | Constituents, donations, recurring, campaigns, events, volunteers, reports |
| Volunteer coordinator | Constituents, events & check-in, volunteers, email templates (no fundraising screens) |

### Useful commands

```powershell
npm run dev          # dev server
npm run typecheck    # TypeScript check
npm run build        # production build (picks the DB engine from DATABASE_URL)
npm run db:reset     # reset LOCAL DB + sample data
npm run db:deploy    # apply the schema to the database in DATABASE_URL
npm run db:init      # production: reference data + first admin (safe to re-run)
```

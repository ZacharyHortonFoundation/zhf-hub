# Migration & cutover plan (AHA / Dynamics → ZHF Hub)

## Before you start
- Confirm **who owns the Stripe account** AHA used. AHA's recurring gifts are Stripe subscriptions
  (`sub_…` ids), and the migration links them to ZHF Hub by that id. If it is ZHF's account, they keep
  billing and ZHF Hub records each payment once its webhook points there. If it is AHA's account,
  recurring donors must be re-invited to set up their gift on the new form (prepare an email).
- The live AHA environment is **`zacharyprod`** (`https://zacharyprod.crm.dynamics.com`);
  `zacharydev` is the sandbox. Sign in with a ZHF staff account that can read all AHA data.
- Production ZHF Hub is ready (Supabase + Vercel, see `04-deployment.md`). Do not seed it.

## Status (2026-11-25): live data checked, dry run and trial copy done
The live data was inspected read-only, dry-run, then copied in full into a throwaway local database
and reconciled against AHA. **Detailed counts, dollar figures and the account used are in
`docs/private/migration-results-2026-11-25.md`, which stays on the migration computer** (the folder
is git-ignored because this repository is public). Summary:
- Every AHA table the migration needs reads without errors, and all admin and public pages load
  against the copied data.
- Gift totals per year match AHA's own "Donation" figures. ZHF Hub's current-year total is higher
  than AHA's dashboard because it also counts gifts made on event pages and pledge payments, which
  AHA's dashboard KPI leaves out.
- Dashboard figures, top-donor lifetime giving, event times, volunteer hours, applications and
  active sign-ups match AHA.
- Still to do: staff spot-check of ~20 constituents; decide about pledges (below).

The migration script was updated to match the live data:
- Ticket purchases are labelled **"One Time Payment"** in AHA's Event category; they are left out
  of donations (the revenue comes over with event orders). Gifts made on event pages, pledge
  payments and the odd "One Time Payment" filed under "Donation" are kept. Yearly/quarterly
  recurring gifts keep their frequency.
- Rows with $0 in every amount field are skipped (free event sign-ups, and payments AHA recorded only
  as "fair market value", i.e. purchases). When AHA leaves one money column at 0 and fills another,
  the filled one is used.
- Opportunity dates, indoor/outdoor, wheelchair access, family-friendly and minimum age use AHA's
  `aha_…` columns; `msnfp_deceased` marks deceased contacts.
- Event, shift and opportunity times are stored by AHA as Pacific wall-clock time ("time-zone
  independent") and birthdays as date-only. The script reads each table's date settings and
  converts these correctly (otherwise times would land 7–8 hours early).
- Most AHA volunteer sign-ups have no shift link, only their own date (e.g. one per week of a weekly
  opportunity). Each goes on that day's shift, created if needed; dates AHA saved as midnight
  US-Eastern are read as dates, not 9 PM the evening before. An opportunity's main shift stays
  within one day. When AHA has the same person on the same shift twice (cancelled, then signed up
  again), the active sign-up is kept.
- New: recurring plans (by Stripe subscription id, with their gifts linked), tags and tag links,
  event registration questions and answers. Sign-in is by device code (no Azure CLI).

AHA data-quality notes for staff (copied as-is): several shift names don't match their dates (AHA
doesn't rename a shift when it is moved); a few Fireworks Booth shifts are stored 4 hours later than
their names say, and AHA shows the same times; "Aha Test Event" is a test record that can be deleted.

**Not migrated** (keep them in the Dynamics backup/export, Step 6):
- **Pledges** (donor commitments and their installment schedules). ZHF Hub has no pledge tracking
  yet. Decide whether to add it or track the open pledges another way.
- Email history, AHA email-communication records, tax-receipt records, AHA settings/templates and
  portal telemetry.
- The **"Donation" activity log**: AHA's background job re-creates these timeline entries in bursts;
  they duplicate the real transactions and are not separate gifts.
- AHA's giving-trend tags (Reduced/Elevated Giving, Consistent Champion, Risk Donor, Major
  Contributor, Recurring Donor) come over as a one-time snapshot and no longer update.

## Step 1 — Inspect (read-only)
```powershell
cd zhf-hub
$env:DYNAMICS_URL = "https://zacharyprod.crm.dynamics.com"
npx tsx scripts/migrate-from-dynamics.ts --inspect
```
The script prints a short code: open https://microsoft.com/devicelogin, enter it and sign in with an
account that can read the AHA data (no Azure CLI needed; the token stays in memory). It then prints
the row count and column names for every table the migration reads. Each run asks for a new code.

If Windows PowerShell refuses `npx`/`npm` ("running scripts is disabled on this system"), type
`npx.cmd` / `npm.cmd` instead.

## Step 2 — Dry run
```powershell
npx tsx scripts/migrate-from-dynamics.ts
```
Reads everything and reports what would be created / skipped, without writing.

## Step 3 — Migrate into a trial copy
```powershell
$env:DATABASE_URL = "file:./trial-migration.db"   # throwaway local database (git-ignored)
npx prisma db push --skip-generate
$env:ADMIN_EMAIL = "trial-admin@zhf.test"; npx tsx prisma/init-production.ts   # reference data + a trial login
npx tsx scripts/migrate-from-dynamics.ts --commit
$env:DATABASE_URL = "file:./dev.db"               # back to the demo database
```
To look at the copy in the app, start the `zhf-hub-trial` preview configuration (`.claude/launch.json`).
Delete `prisma/trial-migration.db` when done — it holds real donor data.
Order: funds → campaigns → contacts/accounts → tags → recurring plans → donations → events →
ticket types → orders & attendees → event questions & answers → programs → opportunities → shifts →
registrations → hours → applications → skills → recompute giving totals, donor levels and hour
badges. Re-running is safe (upserts on `legacyId` / Stripe subscription id).

### Reconciliation checklist
- [ ] Constituent count matches Dynamics (minus records with no name/email)
- [ ] Gift total per year matches the Dynamics "This Year's Donations" KPI and last year's figure
- [ ] Top 10 donors by lifetime giving match
- [ ] Each campaign's total matches
- [ ] Events show the right attendees; opportunities show the right registrations
- [ ] Volunteer hour totals per volunteer match; badges look right
- [ ] Spot-check 20 random constituents end-to-end

## Step 4 — Parallel run (≈2 weeks)
- Staff use ZHF Hub for daily work; AHA stays read-only for reference.
- Re-run the migration with `--commit` the day before cutover to pick up late changes.

## Step 5 — Cutover day
1. Put a notice on the AHA portal; freeze edits in Dynamics.
2. Final `--commit` migration run + reconciliation.
3. Switch Stripe live keys and webhook to ZHF Hub; turn on Resend and the daily job.
4. Point `my.zacharyhortonfoundation.org` (DNS CNAME) to the new host. Update "Donate", "Events"
   and "Volunteer" links on zacharyhortonfoundation.org if they deep-link to old Power Pages URLs
   (`/Donate/`, `/VolunteerHome/`, `/events/` — consider redirects to `/donate`, `/volunteer`, `/events`).
5. Make a live $5 test gift, a free event RSVP and a volunteer sign-up; refund the test gift.
6. Email volunteers their new portal link (password reset flow: staff can set one from the profile,
   or volunteers re-apply with the same email and are recognised).

## Step 6 — Decommission
- Export a full Dynamics backup (Power Platform admin center → environment backup, plus Excel
  exports of every table) and archive it.
- Cancel AHA and the Dynamics/Power Pages licences after one full month without issues.

## Alternative: spreadsheet import
For a quick start (or if API access is hard to get), *Admin → Import data* accepts CSV exports
of Contacts and Transactions from Dynamics ("Export to Excel" → Save as CSV UTF-8), with a dry-run
mode and automatic column mapping.

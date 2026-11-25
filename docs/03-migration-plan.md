# Migration & cutover plan (AHA / Dynamics → ZHF Hub)

## Before you start
- Confirm **who owns the Stripe account** AHA used. If it is ZHF's account, existing card
  subscriptions keep billing and can be linked to ZHF Hub by Stripe subscription id. If it is AHA's
  account, monthly donors must be re-invited to set up their gift on the new form (prepare an email).
- Get read access to the **production** Dynamics environment (the review was done on the
  `zacharydev` sandbox) and the Azure CLI (`az`) on the machine running the migration.
- Stand up production ZHF Hub (PostgreSQL, hosting, secrets) — see `zhf-hub/README.md`. Do not seed.

## Step 1 — Inspect (read-only)
```powershell
cd zhf-hub
az login
$env:DYNAMICS_URL = "https://<org>.crm.dynamics.com"
$env:DYNAMICS_TOKEN = az account get-access-token --resource $env:DYNAMICS_URL --query accessToken -o tsv
npx tsx scripts/migrate-from-dynamics.ts --inspect
```
Prints the row count and column names for every table the migration reads. Compare with the
field names in the script (they come from the sandbox metadata) and adjust any that differ.

## Step 2 — Dry run
```powershell
npx tsx scripts/migrate-from-dynamics.ts
```
Reads everything and reports what would be created / skipped, without writing.

## Step 3 — Migrate into a staging copy
```powershell
$env:DATABASE_URL = "<staging postgres url>"
npx tsx scripts/migrate-from-dynamics.ts --commit
```
Order: funds → campaigns → contacts/accounts → donations → events → ticket types → orders &
attendees → programs → opportunities → shifts → registrations → hours → applications → skills →
recompute giving totals, donor levels and hour badges. Re-running is safe (upserts on `legacyId`).

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

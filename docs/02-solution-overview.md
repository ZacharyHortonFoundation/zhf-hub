# ZHF Hub — solution overview

_A purpose-built replacement for the AHA Apps "Aha Impact" platform (Dynamics 365 + Power Pages)._

## 1. What changes for ZHF

| Today (AHA) | With ZHF Hub |
|---|---|
| Generic Dynamics 365 back office with ~40 tables, many unused | One focused console: Dashboard · Constituents · Donations · Recurring · Campaigns & funds · Events · Check-in · Volunteers · Email · Reports · Settings |
| Power Pages portal that doesn't match the main site | Public pages in ZHF's own brand (logo, navy #33506B, Poppins), mobile-first |
| Per-user Dynamics/Power Pages licensing + AHA subscription | Standard web hosting + Stripe fees; unlimited staff accounts |
| Vendor-controlled changes | ZHF owns the code and data; staff edit email wording, funds, campaigns, donor levels, badges themselves |

## 2. Feature parity map

| AHA capability | ZHF Hub | Notes |
|---|---|---|
| Donation form: one-time/monthly/quarterly/annual, presets + custom, designation, cover fee | ✅ `/donate` | 4-step wizard, "Make it monthly" upsell, live fee calculation |
| Individual / couple / business donors, anonymous, address | ✅ | |
| In honor / in memory + email notification to recipient | ✅ | Tribute email keeps the amount private |
| Employer matching, comments | ✅ | |
| Campaign-specific giving links | ✅ | `/donate?campaign=<slug>`, campaign progress bar |
| Stripe card payments | ✅ Stripe Checkout | + Apple/Google Pay, ACH; PCI handled by Stripe |
| Recurring donations / subscriptions | ✅ | Stripe subscriptions; pause / resume / cancel from console |
| Transactions, one-time donations, receipts | ✅ | Receipt #, major-gift receipt variant ($1,000+), resend, refund |
| Manual gifts (check, cash, in-kind, stock) | ✅ | "Save & add another" for batch entry |
| Designations | ✅ Funds | |
| Donation campaigns with goals | ✅ | Weekly chart, top donors, share link |
| Donor levels (RFM) | ✅ | Platinum…Copper, thresholds editable, auto-recalculated |
| Contacts / accounts / households | ✅ Constituents | Individuals, couples, businesses; tags; VIP; merge duplicates |
| Stewardship checklist | ✅ | Thank-you sent, invited to events, meeting offered, impact story, monthly ask |
| Activities | ✅ Notes & tasks | Timeline + due tasks on dashboard |
| Tax receipts / year-end statements | ✅ | Printable statement + emailed secure link |
| Dashboard KPIs (today / yesterday / month / year / avg / donors) | ✅ | Same measures, plus trend vs last year, recurring revenue, donor levels |
| Events with ticket types, capacity, deadlines | ✅ | Multi-attendee tickets (e.g. foursome), tickets not counting toward capacity (sponsors) |
| Event questions & answers | ✅ | Text / select / checkbox, per attendee |
| Discount codes | ✅ | % or $ off, max uses |
| Cover fee + add-on donation at checkout | ✅ | Add-on is recorded as a real donation |
| QR-code tickets & check-in | ✅ | Phone camera scanner at `/admin/check-in` |
| Add to calendar, share, directions | ✅ | .ics + Google Calendar, embedded map |
| Volunteer application (info → skills → summary) | ✅ | Portal password created during application |
| Applications approve / reject with emails | ✅ | |
| Opportunities with shifts, capacity, programs, skills, accessibility | ✅ | Grid / list / calendar views; full/closed clearly labelled |
| Registrations, cancellations | ✅ | Volunteer self-service in the portal |
| Volunteer hours (submit → approve) | ✅ | Bulk approve; "attended → create hours" one click |
| Badges (hours + recognition) | ✅ | Auto-awarded at 10/25/50/100 hours; recognition badges by staff |
| 20 automated email templates | ✅ | Editable with live preview & test send; outbox log of every email |
| Reminder / follow-up workflows | ✅ | Daily job: event 7d/1d, shift 3d/1d, follow-ups |
| Reports, export to Excel | ✅ | Year report (retention, pyramid, campaigns, funds, events, volunteer impact); CSV exports everywhere |
| Marketing lists / segments / Mailchimp sync | ⚠️ Export only | Constituent filters (LYBUNT, SYBUNT, recurring, level, tag) export to CSV for Mailchimp. Live sync = phase 2 |
| Planned giving, sponsorships, donor commitments (pledges) | ⏳ Phase 2 | All had 0 records in AHA; sponsorships are handled today as "Hole sponsor"-style tickets |
| Leads | — | 0 records; not needed |

## 3. Architecture

```
            Donors / attendees / volunteers                    ZHF staff
                        │                                          │
        my.zacharyhortonfoundation.org (public pages)      /admin (role-based)
                        └───────────────┬──────────────────────────┘
                                 Next.js 15 app (React 19, TypeScript, Tailwind)
                    server components + server actions · zod validation · JWT sessions
                                        │
          ┌──────────────┬──────────────┼──────────────┬─────────────────┐
     PostgreSQL       Stripe        Resend email     Daily cron      Dataverse (one-time
     (Prisma ORM)   Checkout +       (receipts,     (reminders)      migration script)
                    webhooks        notifications)
```

- **Single codebase** for public site + staff console, deployed as one app.
- **Data model** (Prisma): Contact, Tag, Activity, DonorLevel, Fund, Campaign, Donation,
  RecurringPlan, Event, TicketType, EventQuestion, DiscountCode, EventOrder, Attendee, Program,
  Skill, VolunteerSkill, VolunteerApplication, Opportunity, Shift, Registration, VolunteerHour,
  Badge, ContactBadge, EmailTemplate, EmailLog, User, Setting. Every migrated row keeps its
  Dataverse id (`legacyId`).
- **Money** stored as integer cents; **time zone** pinned to America/Los_Angeles.

## 4. Security & privacy

- Card data never touches ZHF servers (Stripe Checkout). Webhooks are signature-verified.
- Staff passwords hashed (bcrypt); sessions are signed, http-only cookies; three roles
  (Administrator, Staff, Volunteer coordinator); every admin page and action re-checks the role.
- Donor statement links are signed tokens that expire.
- Recommended before launch: enable Microsoft Entra ID sign-in for staff (phase 2), daily
  database backups (built into Neon / Azure), and HTTPS-only hosting (default on Vercel/Azure).

## 5. Running costs (estimate — verify current pricing)

| Item | Option | Approx. monthly |
|---|---|---|
| Hosting | Vercel Pro (1 seat) **or** Azure App Service B1 | ~$20 / ~$13 |
| Database | Neon / Supabase / Azure PostgreSQL Flexible (burstable) | $0–25 |
| Email | Resend (3,000/mo free; Pro tier for more) | $0–20 |
| Payments | Stripe — apply for the nonprofit discounted rate | per-transaction fees only |
| **Total platform** | | **≈ $20–70 / month** + Stripe fees |

Compare against the current AHA subscription + Dynamics 365 / Power Pages licences.

## 6. Roadmap

**Phase 1 (built):** everything marked ✅ above, demo-mode payments/email, data import, migration script.

**Phase 2 (recommended next):**
1. Connect live Stripe (ZHF account) and Resend; schedule the daily job.
2. Run the Dataverse migration against production; parallel-run for 2 weeks; cut over the domain.
3. Microsoft Entra ID single sign-on for staff; two-factor for admins.
4. Mailchimp audience sync (tags/segments → Mailchimp).
5. Pledges & sponsorship packages (golf tournament sponsors with benefits tracking).
6. Image uploads to cloud storage; PDF receipts attached to emails.
7. Automated test suite and error monitoring (e.g. Sentry).

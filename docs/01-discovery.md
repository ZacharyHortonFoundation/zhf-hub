# Discovery — what AHA Apps provides ZHF today

_Reviewed 2026-11-24 from the public portal (my.zacharyhortonfoundation.org) and the
"Aha Impact" model-driven app in the **zacharydev** Dynamics 365 sandbox (read-only)._

## 1. Platform underneath

| Layer | What AHA uses |
|---|---|
| Back office | Dynamics 365 / Dataverse model-driven app **"Aha Impact"** |
| Data model | Microsoft **Nonprofit Accelerator** (`msnfp_*` tables) + ~47 custom AHA tables (`aha_*`) |
| Public portal | Microsoft **Power Pages** site at `my.zacharyhortonfoundation.org` |
| Payments | **Stripe** (js.stripe.com v3, Stripe customer id stored on contact) |
| Calendar UI | FullCalendar 6 |
| Email | 20 custom email templates, 522 logged "Email Communication" records |
| Marketing sync | Mailchimp (contact fields `mailchimpid`, `marketingsyncstatus`) |

Costs ZHF carries for this: AHA subscription + Dynamics/Dataverse licences + Power Pages capacity.

## 2. Public portal (what donors / volunteers / attendees see)

### Donations (`/Donate/`)
4-step wizard: **Amount → Details → Dedication → Payment**
- Frequency: One-time, Monthly, Quarterly, Annual
- Preset amounts $25 / $50 / $100 / $500 + custom amount; hidden designation (fund) select
- "Cover transaction fee" checkbox
- Donor type: Individual/Couple (spouse names) or Business (org name, contact, tax ID, address)
- Anonymous option, address & phone
- "Make it Monthly!" upsell on one-time gifts
- Dedication: In Honor Of / In Memory Of, honoree name, optional e-mail notification
  (recipient name, email, personal message)
- Employer matching gift (employer name), additional comments
- Stripe card payment; FAQ + trust badges

### Volunteer (`/VolunteerHome/`)
- Become a Volunteer (application) / Existing Volunteer (login)
- Application wizard: **Info → Skills → Summary** (name, email, phone, emergency contact
  name/phone/email, interested activities, experienced activities)
- Opportunities: Grid / List / Calendar / Map views; filters by Program, Skills,
  wheelchair accessible, duration (single day / recurring), indoor/outdoor, date range,
  "show past"
- Opportunity detail: status (Open/Full/Closed), date/time, hours, remaining spots across
  shifts, description w/ flyer image, age limit, adults-only, register-by date,
  accessibility, location, program, contact person
- Programs: INDOOR VOLUNTEER, OUTDOOR VOLUNTEER
- Skills: Community Event Representation, Social Media & Digital Marketing, Website
  Development & Maintenance, Graphic Design, Homeless Outreach Support, Recovery Program
  Support, Podcast Production & Support

### Events (`/events/`)
- Current / Past tabs, search, list / grid / calendar views, pagination
- Event detail: hero flyer, date/time/location, rich overview, registration end date,
  pricing / tickets, add-to-calendar, share links, directions
- Real events seen: Soberstock, ClovisFest 2026, 10th Annual Fresno & Clovis Recovery
  Summit, International Overdose Awareness Day, Juneteenth Food Giveaway, 4th Annual Mental
  Health Symposium, Break the Stigma Golf Tournament, City Wide Ministry Outreach, Movie
  Night for Christmas

## 3. Back office modules (Aha Impact app sitemap)

| Area | Screens |
|---|---|
| Insights & Reports | Dashboards, Reports, Development Dashboard, Advanced Search |
| Constituents | Contacts, Accounts, Leads |
| Fundraising | One Time Donations, Recurring Donations, Transactions, Activities, Donor Commitments, Donation Campaigns, Planned Giving, Sponsorships, Designations, Subscriptions |
| Marketing | Campaigns, Marketing Lists, Campaign Responses, Segments |
| Event Management | Events, Tickets, Orders, Order Products, Attendees, Questions, Answers |
| Volunteer Management | Applications, Opportunities, Registrations, Hours, Availabilities, Volunteer Skills, Skills, Programs, Volunteer Responses |

Main dashboard KPIs: Today's / Yesterday's / This Month's / This Year's donations (with % vs
prior period), Average donation, Total donors this year; charts for Top 5 donors by lifetime
giving, Top 3 events by revenue, Donors by donor level.

## 4. Data volumes in the sandbox (record counts)

| Table | Rows | | Table | Rows |
|---|---|---|---|---|
| Contacts | 755 | | Events | 8 |
| Transactions | 906 | | Ticket types | 17 |
| Donation campaigns | 13 | | Attendees | 19 |
| Designations (funds) | 9 | | Orders | 17 |
| Donor levels | 5 | | Volunteer applications | 12 |
| Subscriptions (recurring) | 2 | | Engagement opportunities | 56 |
| Email templates | 20 | | Shifts | 16 |
| Email log | 522 | | Registrations (participations) | 94 |
| Volunteer badges | 15 | | Volunteer hours | 13 |
| Tags | 12 | | Skills (qualifications) | 17 |

> Production volumes should be re-counted before migration — this was the sandbox.

## 5. Notable business rules found in the data model

- **Donor levels via RFM scoring** — Platinum ($101k+, 17 gifts), Gold ($76k, 16),
  Silver ($51k, 11), Bronze ($26k, 6), Copper (default). Contact stores recency /
  frequency / monetary scores, lifetime total, average & largest gift, first/last gift date.
- **Stewardship checklist on contacts** — sent thank-you, invited to events, offered to meet
  beneficiary, shared impact stories, informed of monthly giving, birthday/anniversary
  messages, VIP, deceased, household link.
- **Events** — capacity limits, registration cut-off, ticket types (free/paid, attendees per
  ticket, counts toward capacity), per-event required attendee/billing fields, custom
  questions, discount codes, "cover processing fee" (percentage), "add a donation",
  QR-code tickets, attended counts, revenue roll-up.
- **Volunteering** — opportunities with shifts (capacity, hours), registration close date,
  point of contact, program, virtual flag; applications are approved/rejected; hours are
  submitted → approved/cancelled; badges at 10/20/25/50/100 hours plus recognition badges
  (Community Champion, I Made a Difference, Outstanding Service) in Bronze/Silver/Gold.
- **Automated emails** (templates): application created / approved / rejected, registration
  created / cancelled, opportunity 1st & 2nd reminder, follow-up, hours added / approved /
  cancelled, donation confirmation (with threshold variant), event registration
  confirmation, event 1st/2nd reminder, event follow-up, portal invitation, email
  confirmation, password reset.
- **Campaigns** used: Hope Begins Here 2025, Golf Tourney '23/'24/'25, Breaking the Stigma
  Overdose Prevention Summit 2024, Coin Campaign, Direct Mail, General Donation, Major Donor,
  Sip & Learn, Website Donation Form, ZHF Fireworks.

## 6. Pain points with the current setup (observed)

- Three different visual styles; the portal doesn't match the main WordPress site
  (Poppins / navy #33506B / cream).
- "No opportunities found" by default because full/expired items are hidden — confusing.
- Event detail shows "Pricing" with nothing under it for free events; "&gt;" HTML-escaping
  bugs in times ("8:00am &gt; 12:30pm").
- Staff must work in the generic Dynamics UI (dozens of tables, many unused: Leads,
  Accounts, Planned Giving, Sponsorships, Segments all at 0 rows).
- Licensing + vendor lock-in for a small team.

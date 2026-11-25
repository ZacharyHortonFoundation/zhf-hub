// Default email templates — mirrors the 20 templates ZHF had in AHA Impact,
// plus a few new ones (badge awarded, recurring gift, dedication notice).
// Keys are referenced from code; subject/body are editable in Admin → Email templates.

export const EMAIL_TEMPLATES: { key: string; name: string; category: string; subject: string; body: string }[] = [
  // ── Donations ─────────────────────────────────────
  {
    key: "donation.receipt",
    name: "Donation receipt",
    category: "Donations",
    subject: "Thank you for your gift to {{org_name}}",
    body: `Dear {{first_name}},

Thank you for your generous gift of {{amount}} to the {{org_name}}. Because of you, young adults and families affected by addiction in our community have more resources, support and hope.

Receipt #{{receipt_number}}
Date: {{date}}
Gift amount: {{amount}}
Total charged: {{total}}
Designation: {{fund}}
Campaign: {{campaign}}
{{dedication}}

Please keep this email as your official receipt. Our EIN is {{org_ein}}.

With gratitude,
The {{org_name}} team`,
  },
  {
    key: "donation.receipt_major",
    name: "Donation receipt — major gift ($1,000+)",
    category: "Donations",
    subject: "{{first_name}}, your gift is changing lives",
    body: `Dear {{first_name}},

On behalf of the Horton family and everyone at the {{org_name}}, thank you. Your gift of {{amount}} is one of the most meaningful we will receive this year, and a member of our team will be reaching out personally to share how it is being put to work.

Receipt #{{receipt_number}}
Date: {{date}}
Gift amount: {{amount}}
Designation: {{fund}}

Please keep this email as your official receipt. Our EIN is {{org_ein}}.

With deep gratitude,
The {{org_name}} team`,
  },
  {
    key: "donation.recurring_started",
    name: "Recurring gift confirmation",
    category: "Donations",
    subject: "Welcome to our monthly giving family",
    body: `Dear {{first_name}},

Thank you for setting up a {{frequency}} gift of {{amount}}. Recurring gifts give us the steady support we need to plan outreach, restock Narcan and care packages, and be there for families all year long.

You'll receive a receipt every time your gift is processed. To change or cancel your gift at any time, just reply to this email or call us at {{org_phone}}.

With gratitude,
The {{org_name}} team`,
  },
  {
    key: "donation.recurring_canceled",
    name: "Recurring gift canceled",
    category: "Donations",
    subject: "Your recurring gift has been canceled",
    body: `Dear {{first_name}},

As requested, your {{frequency}} gift of {{amount}} has been canceled. Thank you for every gift you've made — it has truly made a difference.

If this was a mistake, or you'd like to restart your gift, visit {{app_url}}/donate.

The {{org_name}} team`,
  },
  {
    key: "donation.dedication_notice",
    name: "Tribute gift notification",
    category: "Donations",
    subject: "A gift has been made {{dedication}}",
    body: `Hello {{recipient_name}},

{{donor_name}} has made a gift to the {{org_name}} {{dedication}}.

{{personal_message}}

The gift will support young adults and families affected by addiction in the Central Valley. (The gift amount is kept private.)

Warmly,
The {{org_name}} team`,
  },
  {
    key: "donation.year_end",
    name: "Year-end giving statement",
    category: "Donations",
    subject: "Your {{year}} giving statement from {{org_name}}",
    body: `Dear {{first_name}},

Thank you for standing with us in {{year}}. Your total tax-deductible giving this year was {{total}} across {{gift_count}} gift(s).

You can view and print your full statement here: {{statement_url}}

Our EIN is {{org_ein}}. No goods or services were provided in exchange for these contributions unless noted.

With gratitude,
The {{org_name}} team`,
  },

  // ── Events ────────────────────────────────────────
  {
    key: "event.confirmation",
    name: "Event registration confirmation",
    category: "Events",
    subject: "You're registered: {{event_title}}",
    body: `Hi {{first_name}},

You're all set for {{event_title}}!

When: {{event_date}}
Where: {{event_location}}
Order #{{order_number}} · {{ticket_count}} ticket(s) · {{total}}

Your tickets (with QR codes for check-in) are here: {{tickets_url}}

See you there!
The {{org_name}} team`,
  },
  {
    key: "event.reminder_1",
    name: "Event first reminder (7 days before)",
    category: "Events",
    subject: "One week to go: {{event_title}}",
    body: `Hi {{first_name}},

Just a reminder that {{event_title}} is one week away.

When: {{event_date}}
Where: {{event_location}}

Your tickets: {{tickets_url}}

The {{org_name}} team`,
  },
  {
    key: "event.reminder_2",
    name: "Event second reminder (1 day before)",
    category: "Events",
    subject: "See you tomorrow at {{event_title}}",
    body: `Hi {{first_name}},

{{event_title}} is tomorrow! Bring your QR code (on your phone is fine) for a quick check-in.

When: {{event_date}}
Where: {{event_location}}
Tickets: {{tickets_url}}

The {{org_name}} team`,
  },
  {
    key: "event.follow_up",
    name: "Event follow-up",
    category: "Events",
    subject: "Thank you for joining us at {{event_title}}",
    body: `Hi {{first_name}},

Thank you for being part of {{event_title}}. Events like this break the stigma of addiction one conversation at a time.

If you'd like to keep the momentum going, you can volunteer ({{app_url}}/volunteer) or make a gift ({{app_url}}/donate).

The {{org_name}} team`,
  },

  // ── Volunteers ────────────────────────────────────
  {
    key: "volunteer.application_received",
    name: "Volunteer application received",
    category: "Volunteers",
    subject: "We received your volunteer application",
    body: `Hi {{first_name}},

Thank you for applying to volunteer with the {{org_name}}! Our volunteer coordinator will review your application and get back to you within a few days.

In the meantime you can sign in to your volunteer portal: {{portal_url}}

The {{org_name}} team`,
  },
  {
    key: "volunteer.application_approved",
    name: "Volunteer application approved",
    category: "Volunteers",
    subject: "Welcome to the team, {{first_name}}!",
    body: `Hi {{first_name}},

Great news — your volunteer application has been approved! You can now sign up for shifts in your volunteer portal:

{{portal_url}}

{{review_notes}}

We can't wait to work with you.
The {{org_name}} team`,
  },
  {
    key: "volunteer.application_rejected",
    name: "Volunteer application not approved",
    category: "Volunteers",
    subject: "About your volunteer application",
    body: `Hi {{first_name}},

Thank you for your interest in volunteering with the {{org_name}}. Unfortunately we aren't able to move forward with your application at this time.

{{review_notes}}

If you have questions please contact us at {{org_email}}.

The {{org_name}} team`,
  },
  {
    key: "volunteer.registration_confirmed",
    name: "Shift registration confirmed",
    category: "Volunteers",
    subject: "You're signed up: {{opportunity_title}}",
    body: `Hi {{first_name}},

Thanks for signing up!

Opportunity: {{opportunity_title}}
When: {{shift_date}}, {{shift_time}}
Where: {{location}}

Need to cancel? Visit your portal: {{portal_url}}

The {{org_name}} team`,
  },
  {
    key: "volunteer.registration_canceled",
    name: "Shift registration canceled",
    category: "Volunteers",
    subject: "Your shift was canceled: {{opportunity_title}}",
    body: `Hi {{first_name}},

Your registration for {{opportunity_title}} on {{shift_date}} has been canceled. We hope to see you at another opportunity soon: {{portal_url}}

The {{org_name}} team`,
  },
  {
    key: "volunteer.reminder_1",
    name: "Opportunity first reminder (3 days before)",
    category: "Volunteers",
    subject: "Coming up: {{opportunity_title}}",
    body: `Hi {{first_name}},

A friendly reminder that you're volunteering at {{opportunity_title}} on {{shift_date}}, {{shift_time}} at {{location}}.

Thank you for giving your time!
The {{org_name}} team`,
  },
  {
    key: "volunteer.reminder_2",
    name: "Opportunity second reminder (1 day before)",
    category: "Volunteers",
    subject: "Tomorrow: {{opportunity_title}}",
    body: `Hi {{first_name}},

See you tomorrow at {{opportunity_title}} — {{shift_time}} at {{location}}.

If something came up, please cancel in your portal so someone else can take your spot: {{portal_url}}

The {{org_name}} team`,
  },
  {
    key: "volunteer.follow_up",
    name: "Opportunity follow-up",
    category: "Volunteers",
    subject: "Thank you for volunteering at {{opportunity_title}}",
    body: `Hi {{first_name}},

Thank you for volunteering at {{opportunity_title}}. Please log your hours in the volunteer portal so we can recognize your impact: {{portal_url}}

The {{org_name}} team`,
  },
  {
    key: "volunteer.hours_submitted",
    name: "Hours submitted",
    category: "Volunteers",
    subject: "We received your volunteer hours",
    body: `Hi {{first_name}},

Thanks for logging {{hours}} hour(s). Our coordinator will review them shortly.

The {{org_name}} team`,
  },
  {
    key: "volunteer.hours_approved",
    name: "Hours approved",
    category: "Volunteers",
    subject: "Your volunteer hours were approved",
    body: `Hi {{first_name}},

{{hours}} volunteer hour(s) have been approved and added to your record. Thank you for everything you do!

See your total hours and badges: {{portal_url}}

The {{org_name}} team`,
  },
  {
    key: "volunteer.hours_rejected",
    name: "Hours not approved",
    category: "Volunteers",
    subject: "About your volunteer hours",
    body: `Hi {{first_name}},

We weren't able to approve the {{hours}} hour(s) you submitted. {{review_notes}}

Questions? Reply to this email.
The {{org_name}} team`,
  },
  {
    key: "volunteer.badge_awarded",
    name: "Badge awarded",
    category: "Volunteers",
    subject: "You earned a badge: {{badge_name}} 🎉",
    body: `Hi {{first_name}},

Congratulations — you've earned the "{{badge_name}}" badge! Thank you for showing up for our community.

See all your badges: {{portal_url}}

The {{org_name}} team`,
  },

  // ── Account ───────────────────────────────────────
  {
    key: "account.portal_invite",
    name: "Volunteer portal — set password link",
    category: "Account",
    subject: "Set up your {{org_name}} volunteer portal",
    body: `Hi {{first_name}},

Use this secure link to set your volunteer portal password (it works for 2 days):

{{portal_url}}

In the portal you can sign up for shifts, log your hours and see your badges.

If you didn't ask for this, you can safely ignore this email.

The {{org_name}} team`,
  },
];

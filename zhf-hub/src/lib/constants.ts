export const ORG = {
  name: "Zachary Horton Foundation",
  short: "ZHF",
  tagline: "Breaking the Stigma of Addiction",
  website: "https://zacharyhortonfoundation.org",
  address: "5150 N 6th St, Suite 156, Fresno, CA 93710",
  phone: "559.349.7581",
  email: "info@zacharyhortonfoundation.org",
  ein: "XX-XXXXXXX", // set in Settings
};

export const FREQUENCIES = [
  { value: "ONE_TIME", label: "One-time", adverb: "" },
  { value: "MONTHLY", label: "Monthly", adverb: "/ month" },
  { value: "QUARTERLY", label: "Quarterly", adverb: "/ quarter" },
  { value: "ANNUAL", label: "Annual", adverb: "/ year" },
] as const;
export type Frequency = (typeof FREQUENCIES)[number]["value"];

export const FREQ_LABEL: Record<string, string> = Object.fromEntries(FREQUENCIES.map((f) => [f.value, f.label]));

export const PAYMENT_METHODS = [
  { value: "CARD", label: "Credit / debit card" },
  { value: "ACH", label: "Bank transfer (ACH)" },
  { value: "CHECK", label: "Check" },
  { value: "CASH", label: "Cash" },
  { value: "IN_KIND", label: "In-kind gift" },
  { value: "STOCK", label: "Stock / securities" },
  { value: "OTHER", label: "Other" },
] as const;
export const METHOD_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

export const DONATION_STATUS = ["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"] as const;
export const PLAN_STATUS = ["PENDING", "ACTIVE", "PAUSED", "PAST_DUE", "CANCELED"] as const;

export const EVENT_CATEGORIES = ["Community", "Fundraiser", "Awareness", "Outreach", "Training"] as const;
export const EVENT_STATUS = ["DRAFT", "PUBLISHED", "CANCELED"] as const;

export const OPPORTUNITY_SETTINGS = [
  { value: "INDOOR", label: "Indoor" },
  { value: "OUTDOOR", label: "Outdoor" },
  { value: "VIRTUAL", label: "Virtual" },
] as const;

export const VOLUNTEER_STATUS = ["NONE", "PENDING", "APPROVED", "REJECTED", "INACTIVE"] as const;

export const ROLES = [
  { value: "ADMIN", label: "Administrator", help: "Everything, including settings and staff accounts" },
  { value: "STAFF", label: "Staff", help: "Donors, donations, events, volunteers, reports" },
  { value: "COORDINATOR", label: "Volunteer coordinator", help: "Volunteers and events only" },
] as const;

/**
 * Volunteers' free-text answers ("how I'd like to help") and emergency contacts can contain
 * personal details, so only these roles see them (not general fundraising staff).
 */
export const VOLUNTEER_PRIVATE_ROLES = ["ADMIN", "COORDINATOR"];
export const canSeeVolunteerPrivate = (role?: string | null) => !!role && VOLUNTEER_PRIVATE_ROLES.includes(role);

/** Default Stripe nonprofit-ish pricing used for "cover the fee". Editable in Settings. */
export const DEFAULT_FEE = { percent: 2.9, fixedCents: 30 };

export const DEFAULT_PRESET_AMOUNTS = [25, 50, 100, 250, 500];

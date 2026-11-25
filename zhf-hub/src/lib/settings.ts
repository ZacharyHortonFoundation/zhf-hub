import { db } from "./db";
import { DEFAULT_FEE, DEFAULT_PRESET_AMOUNTS, ORG } from "./constants";

export type OrgSettings = {
  orgName: string;
  ein: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  feePercent: number;
  feeFixedCents: number;
  presetAmounts: number[];
  donateHeadline: string;
  donateIntro: string;
  receiptFooter: string;
  requireApprovalForSignup: boolean;
  privacyPolicyUrl: string;
};

export const DEFAULT_SETTINGS: OrgSettings = {
  orgName: ORG.name,
  ein: ORG.ein,
  address: ORG.address,
  phone: ORG.phone,
  email: ORG.email,
  website: ORG.website,
  feePercent: DEFAULT_FEE.percent,
  feeFixedCents: DEFAULT_FEE.fixedCents,
  presetAmounts: DEFAULT_PRESET_AMOUNTS,
  donateHeadline: "Every gift brings hope within reach",
  donateIntro:
    "Your contribution helps the Zachary Horton Foundation break the stigma of addiction — funding outreach, recovery support and resources for young adults and families in the Central Valley, when they need it most.",
  receiptFooter:
    "The Zachary Horton Foundation is a 501(c)(3) nonprofit organization. No goods or services were provided in exchange for this contribution unless noted above. Please keep this receipt for your tax records.",
  requireApprovalForSignup: true,
  privacyPolicyUrl: "https://zacharyhortonfoundation.org/privacy-policy/",
};

export async function getSettings(): Promise<OrgSettings> {
  const rows = await db.setting.findMany();
  const out: OrgSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (!(r.key in out)) continue;
    try {
      (out as Record<string, unknown>)[r.key] = JSON.parse(r.value);
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}

export async function saveSettings(patch: Partial<OrgSettings>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    await db.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
  }
}

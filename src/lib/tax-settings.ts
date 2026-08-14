import { GEBRUIKELIJK_LOON } from "@/lib/dutch-tax";
import { TASK_ASSIGNEES } from "@/lib/types";

/**
 * Editable personal box-1 inputs for one partner.
 * YTD = already received; rest = expected for the remainder of the year.
 */
export type PartnerPersonalSettings = {
  salary_ytd: number;
  salary_rest: number;
  /** WW already received this year (gross). */
  ww_ytd: number;
  /** Gross WW per month (UWV). */
  ww_monthly: number;
  /** How many more months of WW are expected this year. */
  ww_months_rest: number;
  /** Vakantiegeld / VSO / nabetalingen already received. */
  other_ytd: number;
  other_rest: number;
  /** Loonheffing withheld by employer + UWV so far. */
  withheld_ytd: number;
  /** Expected remaining loonheffing this year. */
  withheld_rest: number;
  /** Voorlopige aanslagen already paid. */
  provisional_paid: number;
};

/**
 * Assumptions behind the tax reserve and the BV comparison. Stored as strings
 * in the `finance_settings` key/value table. Nested personal income is JSON.
 */
export type TaxSettings = {
  /** Estimated yearly business costs excluding VAT, deducted from revenue. */
  tax_annual_costs: number;
  /** Profit share of the first partner, in percent; the rest goes to the second. */
  tax_profit_split: number;
  /** 1,225+ hours per partner unlocks the zelfstandigenaftrek. */
  tax_urencriterium: boolean;
  tax_startersaftrek: boolean;
  /** Extra yearly cost of running a BV instead of a VOF (accountant, filings). */
  bv_extra_annual_cost: number;
  /** Gross salary per director-shareholder in the BV scenario. */
  bv_dga_salary: number;
  /** Per-partner personal income (Kevin, Xennith). */
  tax_personal: PartnerPersonalSettings[];
};

function defaultWwMonthsRest(today = new Date()): number {
  // Remaining months including the current one (Aug → 5: Aug–Dec).
  return Math.max(0, 12 - today.getMonth());
}

export function defaultPartnerPersonal(
  today = new Date(),
): PartnerPersonalSettings {
  return {
    salary_ytd: 0,
    salary_rest: 0,
    ww_ytd: 0,
    ww_monthly: 2_900,
    ww_months_rest: defaultWwMonthsRest(today),
    other_ytd: 0,
    other_rest: 0,
    withheld_ytd: 0,
    withheld_rest: 0,
    provisional_paid: 0,
  };
}

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  tax_annual_costs: 0,
  tax_profit_split: 50,
  tax_urencriterium: true,
  tax_startersaftrek: false,
  bv_extra_annual_cost: 4_500,
  bv_dga_salary: GEBRUIKELIJK_LOON,
  tax_personal: TASK_ASSIGNEES.map(() => defaultPartnerPersonal()),
};

function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

function parsePartnerPersonal(
  raw: unknown,
  fallback: PartnerPersonalSettings,
): PartnerPersonalSettings {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const o = raw as Record<string, unknown>;
  const num = (key: keyof PartnerPersonalSettings) => {
    const v = o[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && Number.isFinite(Number(v))) return Number(v);
    return fallback[key];
  };
  return {
    salary_ytd: num("salary_ytd"),
    salary_rest: num("salary_rest"),
    ww_ytd: num("ww_ytd"),
    ww_monthly: num("ww_monthly"),
    ww_months_rest: num("ww_months_rest"),
    other_ytd: num("other_ytd"),
    other_rest: num("other_rest"),
    withheld_ytd: num("withheld_ytd"),
    withheld_rest: num("withheld_rest"),
    provisional_paid: num("provisional_paid"),
  };
}

function parsePersonalList(raw: string | undefined): PartnerPersonalSettings[] {
  const defaults = DEFAULT_TAX_SETTINGS.tax_personal;
  if (!raw) return defaults.map((d) => ({ ...d }));
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaults.map((d) => ({ ...d }));
    return defaults.map((fallback, i) => parsePartnerPersonal(parsed[i], fallback));
  } catch {
    return defaults.map((d) => ({ ...d }));
  }
}

/** Full-year gross amounts derived from the editable YTD / rest fields. */
export function personalYearTotals(p: PartnerPersonalSettings) {
  return {
    salary: Math.max(0, p.salary_ytd) + Math.max(0, p.salary_rest),
    ww: Math.max(0, p.ww_ytd) + Math.max(0, p.ww_monthly) * Math.max(0, p.ww_months_rest),
    other: Math.max(0, p.other_ytd) + Math.max(0, p.other_rest),
    withheld: Math.max(0, p.withheld_ytd) + Math.max(0, p.withheld_rest),
    provisionalPaid: Math.max(0, p.provisional_paid),
  };
}

/** YTD-only slice for "where should the pot be now". */
export function personalYtdTotals(p: PartnerPersonalSettings) {
  return {
    salary: Math.max(0, p.salary_ytd),
    ww: Math.max(0, p.ww_ytd),
    other: Math.max(0, p.other_ytd),
    withheld: Math.max(0, p.withheld_ytd),
    provisionalPaid: Math.max(0, p.provisional_paid),
  };
}

export function parseTaxSettings(raw: Record<string, string>): TaxSettings {
  return {
    tax_annual_costs: toNumber(raw.tax_annual_costs, DEFAULT_TAX_SETTINGS.tax_annual_costs),
    tax_profit_split: toNumber(raw.tax_profit_split, DEFAULT_TAX_SETTINGS.tax_profit_split),
    tax_urencriterium: toBoolean(
      raw.tax_urencriterium,
      DEFAULT_TAX_SETTINGS.tax_urencriterium,
    ),
    tax_startersaftrek: toBoolean(
      raw.tax_startersaftrek,
      DEFAULT_TAX_SETTINGS.tax_startersaftrek,
    ),
    bv_extra_annual_cost: toNumber(
      raw.bv_extra_annual_cost,
      DEFAULT_TAX_SETTINGS.bv_extra_annual_cost,
    ),
    bv_dga_salary: toNumber(raw.bv_dga_salary, DEFAULT_TAX_SETTINGS.bv_dga_salary),
    tax_personal: parsePersonalList(raw.tax_personal),
  };
}

/** Serialize a settings value for the key/value store. */
export function serializeTaxSettingValue(
  key: keyof TaxSettings,
  value: TaxSettings[keyof TaxSettings],
): string {
  if (key === "tax_personal") return JSON.stringify(value);
  return String(value);
}

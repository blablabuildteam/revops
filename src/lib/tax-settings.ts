import { GEBRUIKELIJK_LOON } from "@/lib/dutch-tax";

/**
 * Assumptions behind the tax reserve and the BV comparison. Stored as strings
 * in the `finance_settings` key/value table.
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
};

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  tax_annual_costs: 0,
  tax_profit_split: 50,
  tax_urencriterium: true,
  tax_startersaftrek: false,
  bv_extra_annual_cost: 4_500,
  bv_dga_salary: GEBRUIKELIJK_LOON,
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
  };
}

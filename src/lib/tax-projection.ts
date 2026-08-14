import {
  actualRevenueForMonth,
  expectedRevenueForMonth,
  forecastRevenueForMonth,
  type FinanceDeal,
  type Opportunity,
} from "@/lib/types";
import { removeVat } from "@/lib/vat";
import {
  emptyPersonalIncome,
  partnerIncomeTax,
  personalPartnerTax,
  splitProfit,
  vofTax,
  type PartnerTaxOptions,
  type PersonalIncomeInput,
  type PersonalPartnerTaxResult,
  type VofTaxResult,
} from "@/lib/dutch-tax";
import {
  personalYearTotals,
  personalYtdTotals,
  type PartnerPersonalSettings,
} from "@/lib/tax-settings";

export type YearRevenue = {
  year: number;
  /** 1-12: how many months of this year have already been invoiced. */
  monthsElapsed: number;
  /** Payments actually received so far, excluding VAT. */
  realised: number;
  /** Signed deals still to be invoiced this year, excluding VAT. */
  contractedRemaining: number;
  /** Probability-weighted pipeline for the remaining months, excluding VAT. */
  pipelineRemaining: number;
};

function monthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/**
 * Revenue picture for one calendar year, split into what has landed and what
 * is still expected.
 *
 * Finance deals + payments are stored **incl. VAT**; opportunities are **excl.
 * VAT** (pipeline forecast adds VAT so it compares to deal cash, then we strip
 * everything here). VAT is never part of the profit.
 *
 * Confirmed path  = realised payments + unpaid schedule on finance deals.
 * Pipeline path   = same + probability-weighted open opportunities.
 */
export function buildYearRevenue(
  deals: FinanceDeal[],
  opportunities: Opportunity[],
  year: number,
  today = new Date(),
): YearRevenue {
  const isCurrentYear = today.getFullYear() === year;
  const lastElapsedIndex = isCurrentYear
    ? today.getMonth()
    : today.getFullYear() > year
      ? 11
      : -1;

  let realisedGross = 0;
  let contractedGross = 0;
  let pipelineGross = 0;

  for (let m = 0; m < 12; m++) {
    const key = monthKey(year, m);
    const expected = expectedRevenueForMonth(deals, key);
    const paid = actualRevenueForMonth(deals, key);

    realisedGross += paid;
    // Unpaid schedule on confirmed deals — including overdue months.
    contractedGross += Math.max(0, expected - paid);

    // Pipeline only for the rest of the year (not rewriting the past).
    if (m > lastElapsedIndex) {
      pipelineGross += forecastRevenueForMonth(opportunities, key);
    }
  }

  return {
    year,
    monthsElapsed: lastElapsedIndex + 1,
    realised: removeVat(realisedGross),
    contractedRemaining: removeVat(contractedGross),
    pipelineRemaining: removeVat(pipelineGross),
  };
}

export type TaxReserveOptions = PartnerTaxOptions & {
  /** Estimated business costs for the full year, excluding VAT. */
  annualCosts: number;
  /** Profit share of the first partner in percent. */
  firstPartnerSharePct: number;
  partners: number;
  /** Count weighted pipeline towards the projected year profit. */
  includePipeline: boolean;
  /** Optional personal income per partner (Kevin, Xennith). */
  personal?: PartnerPersonalSettings[];
};

export type TaxReserve = {
  /** Confirmed deals only: received + unpaid schedule − costs. */
  projectedRevenue: number;
  projectedProfit: number;
  /** Same plus probability-weighted open opportunities. */
  projectedRevenueWithPipeline: number;
  projectedProfitWithPipeline: number;
  /** Profit earned so far, after a pro-rata share of the yearly costs. */
  profitToDate: number;
  /** VOF-only tax (kept for BV check / flat 40% comparison). */
  projected: VofTaxResult;
  projectedWithPipeline: VofTaxResult;
  /** Combined personal tax per partner for the full year. */
  personalFullYear: PersonalPartnerTaxResult[];
  /** Combined personal tax per partner on YTD incomes + VOF profit to date. */
  personalYtd: PersonalPartnerTaxResult[];
  /** Effective tax rate of the projected year, applied to profit to date. */
  effectiveRate: number;
  /**
   * What should already be sitting in the tax pots (sum of partners):
   * YTD combined tax − YTD withholdings − VA paid.
   */
  reserveToDate: number;
  /** Total still-to-reserve for the whole year (both partners). */
  reserveFullYear: number;
  /** Monthly amount to set aside at the current run rate. */
  monthlyReserve: number;
  /** Sum of totalDue before subtracting withholdings (full year). */
  totalTaxDue: number;
  /** Sum of loonheffing + VA already counted (full year). */
  totalCreditsAgainstTax: number;
  perPartnerShares: number[];
};

function toPersonalInput(
  p: PartnerPersonalSettings | undefined,
  mode: "year" | "ytd",
): PersonalIncomeInput {
  if (!p) return emptyPersonalIncome();
  const totals = mode === "year" ? personalYearTotals(p) : personalYtdTotals(p);
  return {
    salary: totals.salary,
    ww: totals.ww,
    other: totals.other,
    withheld: totals.withheld,
    provisionalPaid: totals.provisionalPaid,
  };
}

export function buildTaxReserve(
  revenue: YearRevenue,
  options: TaxReserveOptions,
): TaxReserve {
  const {
    annualCosts,
    firstPartnerSharePct,
    partners,
    includePipeline,
    personal,
    ...taxOptions
  } = options;

  const confirmedRevenue = revenue.realised + revenue.contractedRemaining;
  const withPipelineRevenue = confirmedRevenue + revenue.pipelineRemaining;

  const projectedRevenue = includePipeline ? withPipelineRevenue : confirmedRevenue;
  const projectedProfit = Math.max(0, projectedRevenue - annualCosts);
  const projectedProfitWithPipeline = Math.max(0, withPipelineRevenue - annualCosts);

  const shares =
    partners === 2
      ? [firstPartnerSharePct, 100 - firstPartnerSharePct]
      : Array(partners).fill(100 / partners);

  const perPartnerShares = splitProfit(projectedProfit, shares);
  const projected = vofTax(perPartnerShares, taxOptions);
  const projectedWithPipeline = vofTax(
    splitProfit(projectedProfitWithPipeline, shares),
    taxOptions,
  );

  const elapsedShare = revenue.monthsElapsed / 12;
  const profitToDate = Math.max(0, revenue.realised - annualCosts * elapsedShare);
  const profitToDateShares = splitProfit(profitToDate, shares);

  const personalFullYear = perPartnerShares.map((share, i) =>
    personalPartnerTax(share, toPersonalInput(personal?.[i], "year"), taxOptions),
  );
  const personalYtd = profitToDateShares.map((share, i) =>
    personalPartnerTax(share, toPersonalInput(personal?.[i], "ytd"), taxOptions),
  );

  const totalTaxDue = personalFullYear.reduce((s, p) => s + p.totalDue, 0);
  const totalCreditsAgainstTax = personalFullYear.reduce(
    (s, p) => s + p.withheld + p.provisionalPaid,
    0,
  );
  const reserveFullYear = personalFullYear.reduce((s, p) => s + p.stillToReserve, 0);
  const reserveToDate = personalYtd.reduce((s, p) => s + p.stillToReserve, 0);

  // VOF-only effective rate kept for the "next euro of VOF profit" hint.
  const effectiveRate = projected.effectiveRate;

  return {
    projectedRevenue,
    projectedProfit,
    projectedRevenueWithPipeline: withPipelineRevenue,
    projectedProfitWithPipeline,
    profitToDate,
    projected,
    projectedWithPipeline,
    personalFullYear,
    personalYtd,
    effectiveRate,
    reserveToDate,
    reserveFullYear,
    monthlyReserve: reserveFullYear / 12,
    totalTaxDue,
    totalCreditsAgainstTax,
    perPartnerShares,
  };
}

/** Tax owed on one extra euro of profit, for pricing and hiring decisions. */
export function marginalRateAt(
  profitShare: number,
  options: PartnerTaxOptions = {},
): number {
  return partnerIncomeTax(profitShare, options).marginalRate;
}

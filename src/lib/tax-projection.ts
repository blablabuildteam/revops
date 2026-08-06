import {
  actualRevenueForMonth,
  expectedRevenueForMonth,
  forecastRevenueForMonth,
  type FinanceDeal,
  type Opportunity,
} from "@/lib/types";
import { removeVat } from "@/lib/vat";
import {
  partnerIncomeTax,
  splitProfit,
  vofTax,
  type PartnerTaxOptions,
  type VofTaxResult,
} from "@/lib/dutch-tax";

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
 * is still expected. Deal amounts are stored including VAT, so everything is
 * converted to a net figure here — VAT is never part of the profit.
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
    realisedGross += actualRevenueForMonth(deals, key);

    if (m > lastElapsedIndex) {
      // Only count contracted revenue that has not been paid yet, so a deal
      // paid ahead of schedule is not counted twice.
      const expected = expectedRevenueForMonth(deals, key);
      const paid = actualRevenueForMonth(deals, key);
      contractedGross += Math.max(0, expected - paid);
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
};

export type TaxReserve = {
  projectedRevenue: number;
  projectedProfit: number;
  /** Profit earned so far, after a pro-rata share of the yearly costs. */
  profitToDate: number;
  projected: VofTaxResult;
  /** Effective tax rate of the projected year, applied to profit to date. */
  effectiveRate: number;
  /** What should already be sitting in the tax account. */
  reserveToDate: number;
  /** Total tax bill expected for the whole year. */
  reserveFullYear: number;
  /** Monthly amount to set aside at the current run rate. */
  monthlyReserve: number;
  perPartnerShares: number[];
};

export function buildTaxReserve(
  revenue: YearRevenue,
  options: TaxReserveOptions,
): TaxReserve {
  const {
    annualCosts,
    firstPartnerSharePct,
    partners,
    includePipeline,
    ...taxOptions
  } = options;

  const projectedRevenue =
    revenue.realised +
    revenue.contractedRemaining +
    (includePipeline ? revenue.pipelineRemaining : 0);

  const projectedProfit = Math.max(0, projectedRevenue - annualCosts);

  const shares =
    partners === 2
      ? [firstPartnerSharePct, 100 - firstPartnerSharePct]
      : Array(partners).fill(100 / partners);

  const perPartnerShares = splitProfit(projectedProfit, shares);
  const projected = vofTax(perPartnerShares, taxOptions);

  const elapsedShare = revenue.monthsElapsed / 12;
  const profitToDate = Math.max(0, revenue.realised - annualCosts * elapsedShare);

  // The bracket a euro lands in depends on the whole year, so the year's
  // effective rate is the right multiplier for profit earned so far.
  const effectiveRate = projected.effectiveRate;

  return {
    projectedRevenue,
    projectedProfit,
    profitToDate,
    projected,
    effectiveRate,
    reserveToDate: profitToDate * effectiveRate,
    reserveFullYear: projected.totalDue,
    monthlyReserve: projected.totalDue / 12,
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

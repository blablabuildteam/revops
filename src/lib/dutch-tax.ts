/**
 * Dutch tax model for a VOF with two partners, plus the BV comparison.
 *
 * All figures are 2026 (below AOW age). Every partner in a VOF is taxed
 * individually in box 1 on their own share of the profit, so the progressive
 * brackets and credits are applied per partner rather than to the firm.
 *
 * This is an estimate for reserving money, not a tax return.
 */

export const TAX_YEAR = 2026;

// --- Box 1 (income from work), below AOW age -------------------------------

type Bracket = { upTo: number; rate: number };

const BOX1_BRACKETS: Bracket[] = [
  { upTo: 38_883, rate: 0.3575 },
  { upTo: 78_426, rate: 0.3756 },
  { upTo: Infinity, rate: 0.495 },
];

/** Deductions only count against this rate, not the 49.5% top rate. */
const TOP_BRACKET_THRESHOLD = 78_426;
const DEDUCTION_RATE_CAP = 0.3756;
const TOP_RATE = 0.495;

// --- Entrepreneur deductions ----------------------------------------------

export const ZELFSTANDIGENAFTREK = 1_200;
export const STARTERSAFTREK = 2_123;
export const MKB_WINSTVRIJSTELLING = 0.127;
export const URENCRITERIUM_HOURS = 1_225;

// --- Tax credits ------------------------------------------------------------

const AHK_MAX = 3_115;
const AHK_PHASE_OUT_START = 29_736;
const AHK_PHASE_OUT_RATE = 0.06398;

const ARBEIDSKORTING_MAX = 5_685;

// --- Healthcare contribution (Zvw) ------------------------------------------

export const ZVW_RATE_SELF_EMPLOYED = 0.0485;
export const ZVW_RATE_EMPLOYER = 0.061;
export const ZVW_MAX_BASE = 79_409;

// --- Corporate tax / BV ------------------------------------------------------

export const VPB_LOW_RATE = 0.19;
export const VPB_HIGH_RATE = 0.258;
export const VPB_THRESHOLD = 200_000;

export const BOX2_LOW_RATE = 0.245;
export const BOX2_HIGH_RATE = 0.31;
export const BOX2_THRESHOLD = 68_843;

/** Statutory minimum salary a director-shareholder must pay themselves. */
export const GEBRUIKELIJK_LOON = 58_000;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function progressiveTax(income: number, brackets: Bracket[]): number {
  if (income <= 0) return 0;
  let tax = 0;
  let previous = 0;
  for (const { upTo, rate } of brackets) {
    if (income <= previous) break;
    tax += (Math.min(income, upTo) - previous) * rate;
    previous = upTo;
  }
  return tax;
}

export function box1Tax(taxableIncome: number): number {
  return progressiveTax(taxableIncome, BOX1_BRACKETS);
}

/** General tax credit — phases out to zero at the top bracket threshold. */
export function algemeneHeffingskorting(income: number): number {
  if (income <= AHK_PHASE_OUT_START) return AHK_MAX;
  const reduced = AHK_MAX - AHK_PHASE_OUT_RATE * (income - AHK_PHASE_OUT_START);
  return Math.max(0, reduced);
}

/** Employment credit — entrepreneurs get it over their taxable profit. */
export function arbeidskorting(laborIncome: number): number {
  const i = Math.max(0, laborIncome);
  if (i <= 11_965) return 0.08324 * i;
  if (i <= 25_845) return 996 + 0.31009 * (i - 11_965);
  if (i <= 45_592) return 5_300 + 0.0195 * (i - 25_845);
  if (i <= 132_920) return Math.max(0, ARBEIDSKORTING_MAX - 0.0651 * (i - 45_592));
  return 0;
}

export function zvwSelfEmployed(taxableProfit: number): number {
  return ZVW_RATE_SELF_EMPLOYED * Math.min(Math.max(0, taxableProfit), ZVW_MAX_BASE);
}

export function vpbTax(profit: number): number {
  if (profit <= 0) return 0;
  return (
    VPB_LOW_RATE * Math.min(profit, VPB_THRESHOLD) +
    VPB_HIGH_RATE * Math.max(0, profit - VPB_THRESHOLD)
  );
}

export function box2Tax(dividend: number): number {
  if (dividend <= 0) return 0;
  return (
    BOX2_LOW_RATE * Math.min(dividend, BOX2_THRESHOLD) +
    BOX2_HIGH_RATE * Math.max(0, dividend - BOX2_THRESHOLD)
  );
}

// ---------------------------------------------------------------------------
// IB for one VOF partner
// ---------------------------------------------------------------------------

export type PartnerTaxOptions = {
  /** 1,225+ hours in the business unlocks the zelfstandigenaftrek. */
  urencriterium?: boolean;
  /** Extra deduction, available at most 3 times in the first 5 years. */
  startersaftrek?: boolean;
};

export type PartnerTaxResult = {
  profitShare: number;
  zelfstandigenaftrek: number;
  startersaftrek: number;
  mkbVrijstelling: number;
  taxableProfit: number;
  grossTax: number;
  /** Extra levy because deductions only count at 37.56%, not 49.5%. */
  deductionRateAdjustment: number;
  algemeneHeffingskorting: number;
  arbeidskorting: number;
  totalCredits: number;
  incomeTax: number;
  zvw: number;
  totalDue: number;
  netIncome: number;
  /** Share of the profit that goes to tax + Zvw. */
  effectiveRate: number;
  /** Tax on one extra euro of profit — useful for pricing decisions. */
  marginalRate: number;
};

function computePartnerTax(
  profitShare: number,
  options: PartnerTaxOptions = {},
): PartnerTaxResult {
  const profit = Math.max(0, profitShare);
  const { urencriterium = true, startersaftrek: starter = false } = options;

  // The zelfstandigenaftrek cannot exceed the profit, unless the starter
  // deduction applies — then the full amount is allowed and can create a loss.
  const zelfstandigen = urencriterium
    ? starter
      ? ZELFSTANDIGENAFTREK
      : Math.min(ZELFSTANDIGENAFTREK, profit)
    : 0;
  const starters = urencriterium && starter ? STARTERSAFTREK : 0;

  const afterEntrepreneurDeduction = Math.max(0, profit - zelfstandigen - starters);
  const mkbVrijstelling = MKB_WINSTVRIJSTELLING * afterEntrepreneurDeduction;
  const taxableProfit = afterEntrepreneurDeduction - mkbVrijstelling;

  const grossTax = box1Tax(taxableProfit);

  // Only the slice of the deductions that would otherwise land in the 49.5%
  // bracket gets corrected back to 37.56%.
  const deductionsInTopBracket = Math.max(
    0,
    profit - Math.max(TOP_BRACKET_THRESHOLD, taxableProfit),
  );
  const deductionRateAdjustment = (TOP_RATE - DEDUCTION_RATE_CAP) * deductionsInTopBracket;

  const ahk = algemeneHeffingskorting(taxableProfit);
  const ak = arbeidskorting(taxableProfit);
  // Credits reduce tax owed but are never paid out.
  const totalCredits = Math.min(ahk + ak, grossTax + deductionRateAdjustment);

  const incomeTax = Math.max(0, grossTax + deductionRateAdjustment - totalCredits);
  const zvw = zvwSelfEmployed(taxableProfit);
  const totalDue = incomeTax + zvw;

  return {
    profitShare: profit,
    zelfstandigenaftrek: zelfstandigen,
    startersaftrek: starters,
    mkbVrijstelling,
    taxableProfit,
    grossTax,
    deductionRateAdjustment,
    algemeneHeffingskorting: ahk,
    arbeidskorting: ak,
    totalCredits,
    incomeTax,
    zvw,
    totalDue,
    netIncome: profit - totalDue,
    effectiveRate: profit > 0 ? totalDue / profit : 0,
    marginalRate: 0,
  };
}

/** Tax due for one partner on their share of the VOF profit. */
export function partnerIncomeTax(
  profitShare: number,
  options: PartnerTaxOptions = {},
): PartnerTaxResult {
  const base = computePartnerTax(profitShare, options);
  const step = 1_000;
  const bumped = computePartnerTax(profitShare + step, options);
  return {
    ...base,
    marginalRate: (bumped.totalDue - base.totalDue) / step,
  };
}

// ---------------------------------------------------------------------------
// VOF as a whole
// ---------------------------------------------------------------------------

export type VofTaxResult = {
  totalProfit: number;
  partners: PartnerTaxResult[];
  totalDue: number;
  totalNet: number;
  effectiveRate: number;
};

/**
 * @param profitShares one entry per partner; they should add up to the profit.
 */
export function vofTax(
  profitShares: number[],
  options: PartnerTaxOptions = {},
): VofTaxResult {
  const partners = profitShares.map((share) => partnerIncomeTax(share, options));
  const totalProfit = partners.reduce((sum, p) => sum + p.profitShare, 0);
  const totalDue = partners.reduce((sum, p) => sum + p.totalDue, 0);
  return {
    totalProfit,
    partners,
    totalDue,
    totalNet: totalProfit - totalDue,
    effectiveRate: totalProfit > 0 ? totalDue / totalProfit : 0,
  };
}

/** Split a profit across partners by percentage (falls back to an even split). */
export function splitProfit(profit: number, shares: number[]): number[] {
  const total = shares.reduce((sum, s) => sum + s, 0);
  if (total <= 0) return shares.map(() => profit / Math.max(1, shares.length));
  return shares.map((s) => (profit * s) / total);
}

// ---------------------------------------------------------------------------
// BV comparison
// ---------------------------------------------------------------------------

export type BvOptions = {
  partners: number;
  /** Gross salary per director-shareholder. */
  dgaSalary?: number;
  /** Extra yearly accountancy/admin cost of running a BV versus a VOF. */
  extraAnnualCost?: number;
  /** Distribute everything as dividend, or leave the surplus in the BV. */
  payout?: "full" | "salary_only";
};

export type BvTaxResult = {
  totalProfit: number;
  dgaSalaryTotal: number;
  employerZvw: number;
  extraAnnualCost: number;
  vpbBase: number;
  vpb: number;
  distributable: number;
  dividendPerPartner: number;
  box2Total: number;
  salaryTaxTotal: number;
  /** Cash in the partners' pockets this year. */
  totalNet: number;
  /** Profit left inside the BV, still carrying a future box 2 claim. */
  retainedInBv: number;
  /** Box 2 that would still be due on the retained profit. */
  deferredBox2: number;
  /**
   * Cash this year + equity left in the BV after VPB.
   * This is the holding-style picture: you have not paid box 2 yet on
   * retained profit, so the firm is wealthier even if your private
   * account is not.
   */
  economicNet: number;
  effectiveRate: number;
};

/** Box 1 on a salary: no entrepreneur deductions, employer pays the Zvw. */
function salaryTax(gross: number): number {
  const taxBeforeCredits = box1Tax(gross);
  const credits = Math.min(
    algemeneHeffingskorting(gross) + arbeidskorting(gross),
    taxBeforeCredits,
  );
  return Math.max(0, taxBeforeCredits - credits);
}

export function bvTax(totalProfit: number, options: BvOptions): BvTaxResult {
  const {
    partners,
    dgaSalary = GEBRUIKELIJK_LOON,
    extraAnnualCost = 0,
    payout = "full",
  } = options;

  const profit = Math.max(0, totalProfit);
  // A BV cannot pay out more salary than it earns; below that the tax office
  // generally accepts a lower salary than the statutory minimum.
  const affordableSalary = Math.min(dgaSalary, Math.max(0, profit / partners));
  const dgaSalaryTotal = affordableSalary * partners;

  const employerZvw =
    ZVW_RATE_EMPLOYER * Math.min(affordableSalary, ZVW_MAX_BASE) * partners;

  const vpbBase = Math.max(0, profit - dgaSalaryTotal - employerZvw - extraAnnualCost);
  const vpb = vpbTax(vpbBase);
  const distributable = vpbBase - vpb;

  const salaryTaxTotal = salaryTax(affordableSalary) * partners;
  const netSalaryTotal = dgaSalaryTotal - salaryTaxTotal;

  if (payout === "salary_only") {
    const deferredBox2 = box2Tax(distributable / partners) * partners;
    const economicNet = netSalaryTotal + distributable;
    return {
      totalProfit: profit,
      dgaSalaryTotal,
      employerZvw,
      extraAnnualCost,
      vpbBase,
      vpb,
      distributable,
      dividendPerPartner: 0,
      box2Total: 0,
      salaryTaxTotal,
      totalNet: netSalaryTotal,
      retainedInBv: distributable,
      deferredBox2,
      economicNet,
      // Tax paid this year only — deferred box 2 is not counted yet.
      effectiveRate: profit > 0 ? (salaryTaxTotal + vpb + employerZvw) / profit : 0,
    };
  }

  const dividendPerPartner = distributable / partners;
  const box2Total = box2Tax(dividendPerPartner) * partners;
  const totalNet = netSalaryTotal + distributable - box2Total;

  return {
    totalProfit: profit,
    dgaSalaryTotal,
    employerZvw,
    extraAnnualCost,
    vpbBase,
    vpb,
    distributable,
    dividendPerPartner,
    box2Total,
    salaryTaxTotal,
    totalNet,
    retainedInBv: 0,
    deferredBox2: 0,
    economicNet: totalNet,
    effectiveRate: profit > 0 ? (profit - totalNet) / profit : 0,
  };
}

// ---------------------------------------------------------------------------
// VOF versus BV
// ---------------------------------------------------------------------------

export type ComparisonPoint = {
  profit: number;
  vofNet: number;
  /** BV figure used for the comparison (cash, or cash + retained equity). */
  bvNet: number;
  /** Positive means the BV leaves more money/wealth than the VOF. */
  difference: number;
  /** Cash in partners' pockets under the BV scenario. */
  bvCash: number;
  /** Equity left in the BV after VPB (0 when everything is paid out). */
  bvRetained: number;
};

export type ComparisonOptions = PartnerTaxOptions &
  Omit<BvOptions, "partners"> & {
    partners?: number;
    profitShares?: number[];
  };

/**
 * Compare VOF vs BV at one profit level.
 *
 * Default payout is `salary_only` (holding-style): partners take the
 * statutory salary and leave the rest in the BV after VPB. The BV side of
 * the comparison then counts that retained equity as wealth — which is how
 * a holding structure actually works until you take a private dividend.
 * Pass `payout: "full"` to force an immediate box 2 hit on everything.
 */
export function compareAtProfit(
  profit: number,
  options: ComparisonOptions = {},
): ComparisonPoint {
  const partners = options.partners ?? options.profitShares?.length ?? 2;
  const shares = options.profitShares ?? Array(partners).fill(1);
  const payout = options.payout ?? "salary_only";
  const vof = vofTax(splitProfit(profit, shares), options);
  const bv = bvTax(profit, { ...options, partners, payout });
  return {
    profit,
    vofNet: vof.totalNet,
    bvNet: bv.economicNet,
    difference: bv.economicNet - vof.totalNet,
    bvCash: bv.totalNet,
    bvRetained: bv.retainedInBv,
  };
}

export function buildComparisonSeries(
  maxProfit: number,
  step: number,
  options: ComparisonOptions = {},
): ComparisonPoint[] {
  const points: ComparisonPoint[] = [];
  for (let profit = 0; profit <= maxProfit; profit += step) {
    points.push(compareAtProfit(profit, options));
  }
  return points;
}

export type BvAdvantageRange = {
  /** Profit from which the BV wins, or null if it never does. */
  from: number | null;
  /** Profit above which the VOF wins again, or null if the BV keeps winning. */
  to: number | null;
  /** Profit level where the BV advantage is largest. */
  peakProfit: number;
  peakAdvantage: number;
};

/** Refine a crossing that sits between a losing and a winning profit level. */
function refineCrossing(
  losing: number,
  winning: number,
  options: ComparisonOptions,
): number {
  let low = losing;
  let high = winning;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (compareAtProfit(mid, options).difference > 0) high = mid;
    else low = mid;
  }
  return Math.round(high / 100) * 100;
}

/**
 * The profit band in which a BV nets more than the VOF.
 *
 * This is a band rather than a single break-even point. Below it the statutory
 * director salary plus the extra running costs outweigh the lower rate, and
 * above it the uncapped 12.7% mkb-winstvrijstelling makes the VOF cheaper
 * again. We anchor the search on the peak advantage so the near-zero profit
 * region — where both routes owe almost nothing — cannot be mistaken for the
 * real crossing.
 */
export function findBvAdvantageRange(
  options: ComparisonOptions = {},
  maxProfit = 1_500_000,
): BvAdvantageRange {
  const step = 5_000;

  let peakProfit = 0;
  let peakAdvantage = -Infinity;
  // Skip the first steps: at negligible profit neither route owes real tax.
  for (let profit = 25_000; profit <= maxProfit; profit += step) {
    const { difference } = compareAtProfit(profit, options);
    if (difference > peakAdvantage) {
      peakAdvantage = difference;
      peakProfit = profit;
    }
  }

  if (peakAdvantage <= 0) {
    return { from: null, to: null, peakProfit, peakAdvantage };
  }

  let from: number | null = null;
  for (let profit = peakProfit - step; profit >= 0; profit -= step) {
    if (compareAtProfit(profit, options).difference <= 0) {
      from = refineCrossing(profit, profit + step, options);
      break;
    }
  }

  let to: number | null = null;
  for (let profit = peakProfit + step; profit <= maxProfit; profit += step) {
    if (compareAtProfit(profit, options).difference <= 0) {
      // Mirror of refineCrossing: here the lower bound is the winning side.
      let low = profit - step;
      let high = profit;
      for (let i = 0; i < 24; i++) {
        const mid = (low + high) / 2;
        if (compareAtProfit(mid, options).difference > 0) low = mid;
        else high = mid;
      }
      to = Math.round(low / 100) * 100;
      break;
    }
  }

  return { from: from ?? 0, to, peakProfit, peakAdvantage };
}

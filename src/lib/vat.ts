/**
 * VAT convention in this app:
 *
 * - Opportunities (`expected_value`): stored **excl. VAT** (deal order).
 * - Finance deals (`total_deal_value`, `monthly_fee`, `monthly_revshare`) and
 *   deal payments / Bunq amounts: stored **incl. VAT** so they match the bank.
 * - Capacity (€175/h) and tax profit: always work on **excl. VAT**
 *   (strip VAT from finance deals; opportunities are already net).
 * - Pipeline revenue charts that sit next to cash: add VAT to opportunities
 *   so they line up with deal amounts, then strip again for tax.
 */
export const VAT_RATE = 0.21;
export const VAT_MULTIPLIER = 1.21;

export const EXCL_VAT_SUFFIX = "excl. VAT";
export const INCL_VAT_SUFFIX = "incl. VAT";

export function addVat(net: number): number {
  return Math.round(net * VAT_MULTIPLIER * 100) / 100;
}

export function removeVat(gross: number): number {
  return Math.round((gross / VAT_MULTIPLIER) * 100) / 100;
}

export function vatFromNet(net: number): number {
  return Math.round(net * VAT_RATE * 100) / 100;
}

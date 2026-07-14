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

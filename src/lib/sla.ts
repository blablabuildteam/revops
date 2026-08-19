import type { SlaBillingFrequency } from "@/lib/types";

/** Period key for invoice tracking: `YYYY-MM` or `YYYY-Qn`. */
export function slaInvoicePeriod(
  frequency: SlaBillingFrequency,
  date = new Date(),
): string {
  const year = date.getFullYear();
  if (frequency === "quarterly") {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${year}-Q${quarter}`;
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function formatSlaPeriodLabel(period: string): string {
  const quarterMatch = /^(\d{4})-Q([1-4])$/.exec(period);
  if (quarterMatch) {
    return `Q${quarterMatch[2]} ${quarterMatch[1]}`;
  }
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(period);
  if (monthMatch) {
    const d = new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1);
    return d.toLocaleDateString("nl-NL", { month: "short", year: "numeric" });
  }
  return period;
}

export function slaInvoiceAmount(
  monthlyAmount: number,
  frequency: SlaBillingFrequency,
): number {
  return frequency === "quarterly" ? monthlyAmount * 3 : monthlyAmount;
}

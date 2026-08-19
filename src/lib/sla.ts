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

export function formatSlaPeriodLabel(period: string, short = false): string {
  const quarterMatch = /^(\d{4})-Q([1-4])$/.exec(period);
  if (quarterMatch) {
    return short
      ? `Q${quarterMatch[2]}`
      : `Q${quarterMatch[2]} ${quarterMatch[1]}`;
  }
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(period);
  if (monthMatch) {
    const d = new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1);
    return d.toLocaleDateString("nl-NL", {
      month: short ? "short" : "long",
      ...(short ? {} : { year: "numeric" }),
    });
  }
  return period;
}

export function slaInvoiceAmount(
  monthlyAmount: number,
  frequency: SlaBillingFrequency,
): number {
  return frequency === "quarterly" ? monthlyAmount * 3 : monthlyAmount;
}

function parseDateOnly(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function normalizeInvoicedPeriods(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      return normalizeInvoicedPeriods(JSON.parse(value));
    } catch {
      return value ? [value] : [];
    }
  }
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter(Boolean))].sort();
}

/** First period key on/after the SLA start date. */
export function slaStartPeriod(
  frequency: SlaBillingFrequency,
  startDate: string | Date | null | undefined,
): string | null {
  const d = parseDateOnly(startDate);
  if (!d) return null;
  return slaInvoicePeriod(frequency, d);
}

function periodSortKey(period: string): number {
  const q = /^(\d{4})-Q([1-4])$/.exec(period);
  if (q) return Number(q[1]) * 100 + Number(q[2]) * 3;
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  return 0;
}

export function compareSlaPeriods(a: string, b: string): number {
  return periodSortKey(a) - periodSortKey(b);
}

/** All periods in a calendar year (months or quarters). */
export function listSlaPeriodsInYear(
  year: number,
  frequency: SlaBillingFrequency,
): string[] {
  if (frequency === "quarterly") {
    return [1, 2, 3, 4].map((q) => `${year}-Q${q}`);
  }
  return Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, "0");
    return `${year}-${month}`;
  });
}

export type SlaYearPeriod = {
  key: string;
  label: string;
  /** On/after SLA start — can be toggled. */
  available: boolean;
  /** Period is after the current calendar period. */
  future: boolean;
};

/**
 * Periods for one year, marked available from SLA start onwards.
 * Future periods in the year stay visible (opsparen / vooruit) but flagged.
 */
export function buildSlaYearPeriods(
  year: number,
  frequency: SlaBillingFrequency,
  startDate: string | Date | null | undefined,
  now = new Date(),
): SlaYearPeriod[] {
  const start = slaStartPeriod(frequency, startDate);
  const current = slaInvoicePeriod(frequency, now);
  return listSlaPeriodsInYear(year, frequency).map((key) => {
    const available = !start || compareSlaPeriods(key, start) >= 0;
    const future = compareSlaPeriods(key, current) > 0;
    return {
      key,
      label: formatSlaPeriodLabel(key, true),
      available,
      future,
    };
  });
}

/** Periods from start through now that still need invoicing. */
export function listOpenSlaPeriods(
  frequency: SlaBillingFrequency,
  startDate: string | Date | null | undefined,
  invoicedPeriods: string[],
  now = new Date(),
): string[] {
  const start = slaStartPeriod(frequency, startDate);
  if (!start) return [];
  const current = slaInvoicePeriod(frequency, now);
  const invoiced = new Set(invoicedPeriods);
  const open: string[] = [];

  const startYear = Number(start.slice(0, 4));
  const endYear = now.getFullYear();
  for (let year = startYear; year <= endYear; year++) {
    for (const key of listSlaPeriodsInYear(year, frequency)) {
      if (compareSlaPeriods(key, start) < 0) continue;
      if (compareSlaPeriods(key, current) > 0) continue;
      if (!invoiced.has(key)) open.push(key);
    }
  }
  return open;
}

export function toggleSlaPeriod(periods: string[], period: string): string[] {
  const set = new Set(normalizeInvoicedPeriods(periods));
  if (set.has(period)) set.delete(period);
  else set.add(period);
  return [...set].sort(compareSlaPeriods);
}

export function mapSlaRow(row: Record<string, unknown>) {
  const frequency = (row.billing_frequency as SlaBillingFrequency) ?? "monthly";
  const currentPeriod = slaInvoicePeriod(frequency);
  let invoicedPeriods = normalizeInvoicedPeriods(row.invoiced_periods);

  // Legacy single-period columns → include in array for API consumers.
  if (
    Boolean(row.invoiced) &&
    typeof row.invoice_period === "string" &&
    row.invoice_period &&
    !invoicedPeriods.includes(row.invoice_period)
  ) {
    invoicedPeriods = [...invoicedPeriods, row.invoice_period].sort(
      compareSlaPeriods,
    );
  }

  const startDate =
    row.start_date == null
      ? null
      : typeof row.start_date === "string"
        ? row.start_date.slice(0, 10)
        : row.start_date instanceof Date
          ? `${row.start_date.getFullYear()}-${String(row.start_date.getMonth() + 1).padStart(2, "0")}-${String(row.start_date.getDate()).padStart(2, "0")}`
          : String(row.start_date).slice(0, 10);

  return {
    ...row,
    start_date: startDate,
    monthly_amount: Number(row.monthly_amount) || 0,
    invoiced_periods: invoicedPeriods,
    invoiced: invoicedPeriods.includes(currentPeriod),
    current_period: currentPeriod,
    open_periods: listOpenSlaPeriods(frequency, startDate, invoicedPeriods),
  };
}

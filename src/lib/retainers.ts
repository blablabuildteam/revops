import type {
  RetainerAgreement,
  RetainerBillingModel,
  RetainerHoursCadence,
  RetainerPeriodAnchor,
  RetainerTimeEntry,
  RetainerWithEntries,
  RevenueBreakdownItem,
} from "@/lib/types";

/** Monday (local) of the week containing `date`. */
export function weekStartOf(date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateOnly(d);
}

export function addDays(dateOnly: string, days: number): string {
  const d = parseDateOnly(dateOnly);
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

export function formatWeekLabel(weekStart: string): string {
  const start = parseDateOnly(weekStart);
  const end = parseDateOnly(addDays(weekStart, 6));
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${start.toLocaleDateString("nl-NL", opts)} – ${end.toLocaleDateString("nl-NL", opts)}`;
}

function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateOnly(value: string): Date {
  const [y, m, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function monthKeyOf(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
}

export type RetainerBillingPeriod = {
  /** Stable key stored in invoiced_periods. */
  key: string;
  start: string;
  end: string;
  label: string;
  /** Calendar month when this period should hit finance (arrears). */
  invoiceMonth: string;
};

/** Invoice month = calendar month after the month the period ends. */
function invoiceMonthForPeriodEnd(periodEnd: string): string {
  const end = parseDateOnly(periodEnd);
  return monthKeyOf(new Date(end.getFullYear(), end.getMonth() + 1, 1));
}

/**
 * Billing periods from retainer start through `through` (inclusive of current open period).
 * - calendar: full calendar months (Solero)
 * - start_day: rolling windows anchored on start_date day-of-month (Adsomnia 15→14)
 */
export function listRetainerBillingPeriods(
  retainer: Pick<RetainerAgreement, "start_date" | "period_anchor">,
  through = new Date(),
): RetainerBillingPeriod[] {
  if (!retainer.start_date) return [];
  const start = parseDateOnly(retainer.start_date);
  const throughDate = new Date(
    through.getFullYear(),
    through.getMonth(),
    through.getDate(),
  );
  if (throughDate < start) return [];

  const periods: RetainerBillingPeriod[] = [];
  const anchor = retainer.period_anchor ?? "calendar";

  if (anchor === "calendar") {
    let y = start.getFullYear();
    let m = start.getMonth();
    const endY = throughDate.getFullYear();
    const endM = throughDate.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const pStart = new Date(y, m, 1);
      const pEnd = new Date(y, m + 1, 0);
      // First month may start mid-month
      const periodStart =
        y === start.getFullYear() && m === start.getMonth()
          ? toDateOnly(start)
          : toDateOnly(pStart);
      const periodEnd = toDateOnly(pEnd);
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      periods.push({
        key,
        start: periodStart,
        end: periodEnd,
        label: formatMonthLabel(key),
        invoiceMonth: invoiceMonthForPeriodEnd(periodEnd),
      });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return periods;
  }

  // Rolling from start day-of-month
  const day = start.getDate();
  let cursor = new Date(start.getFullYear(), start.getMonth(), day);
  while (cursor <= throughDate) {
    const pStart = toDateOnly(cursor);
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, day);
    const pEnd = addDays(toDateOnly(next), -1);
    periods.push({
      key: pStart,
      start: pStart,
      end: pEnd,
      label: `${parseDateOnly(pStart).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – ${parseDateOnly(pEnd).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`,
      invoiceMonth: invoiceMonthForPeriodEnd(pEnd),
    });
    cursor = next;
    // Safety
    if (periods.length > 120) break;
  }
  return periods;
}

export function currentBillingPeriod(
  retainer: Pick<RetainerAgreement, "start_date" | "period_anchor">,
  date = new Date(),
): RetainerBillingPeriod | null {
  const dateOnly = toDateOnly(date);
  const periods = listRetainerBillingPeriods(retainer, date);
  return (
    periods.find((p) => p.start <= dateOnly && dateOnly <= p.end) ??
    periods[periods.length - 1] ??
    null
  );
}

export function entryInPeriod(
  entry: RetainerTimeEntry,
  period: Pick<RetainerBillingPeriod, "start" | "end">,
): boolean {
  const ref = (entry.work_date || entry.week_start || "").slice(0, 10);
  if (!ref) return false;
  return ref >= period.start && ref <= period.end;
}

export function entryInWeek(entry: RetainerTimeEntry, weekStart: string): boolean {
  return entry.week_start?.slice(0, 10) === weekStart;
}

export function sumHours(entries: RetainerTimeEntry[]): number {
  return entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
}

export function includedHoursForWeek(
  retainer: Pick<RetainerAgreement, "hours_cadence" | "hours_included">,
): number {
  const included = Number(retainer.hours_included) || 0;
  if (retainer.hours_cadence === "monthly") {
    return Math.round((included / 4.333) * 10) / 10;
  }
  return included;
}

export function includedHoursForPeriod(
  retainer: Pick<RetainerAgreement, "hours_cadence" | "hours_included">,
): number {
  const included = Number(retainer.hours_included) || 0;
  if (retainer.hours_cadence === "weekly") {
    // Rolling/calendar billing period ≈ 1 month ≈ 4.333 weeks
    return Math.round(included * 4.333 * 10) / 10;
  }
  return included;
}

export function estimateInvoiceAmount(
  retainer: Pick<RetainerAgreement, "billing_model" | "hourly_rate" | "monthly_fee">,
  hoursInPeriod: number,
): number {
  if (retainer.billing_model === "fixed_monthly") {
    return Number(retainer.monthly_fee) || 0;
  }
  return (Number(retainer.hourly_rate) || 0) * hoursInPeriod;
}

/** Hours bank: included since start − used. Positive = underused (flex space). */
export function flexHoursBalance(
  retainer: RetainerWithEntries,
  through = new Date(),
): { included: number; used: number; balance: number } {
  const periods = listRetainerBillingPeriods(retainer, through);
  const current = currentBillingPeriod(retainer, through);
  const closed = current
    ? periods.filter((p) => p.key !== current.key)
    : periods;

  // Soft flex: full included for each closed period + current period allotment
  const included =
    closed.length * includedHoursForPeriod(retainer) +
    (current ? includedHoursForPeriod(retainer) : 0);

  const used = sumHours(retainer.entries ?? []);
  return {
    included,
    used,
    balance: Math.round((included - used) * 10) / 10,
  };
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

export function toggleInvoicedPeriod(periods: string[], key: string): string[] {
  const set = new Set(normalizeInvoicedPeriods(periods));
  if (set.has(key)) set.delete(key);
  else set.add(key);
  return [...set].sort();
}

export function hoursInBillingPeriod(
  retainer: RetainerWithEntries,
  period: RetainerBillingPeriod,
): number {
  return sumHours(
    (retainer.entries ?? []).filter((e) => entryInPeriod(e, period)),
  );
}

/** Expected retainer revenue attributed to a finance calendar month. */
export function retainerExpectedForFinanceMonth(
  retainers: RetainerWithEntries[],
  financeMonth: string,
): RevenueBreakdownItem[] {
  const items: RevenueBreakdownItem[] = [];
  for (const retainer of retainers) {
    if (retainer.status === "ended" || retainer.status === "paused") continue;
    const periods = listRetainerBillingPeriods(retainer, new Date(2100, 0, 1));
    for (const period of periods) {
      if (period.invoiceMonth !== financeMonth) continue;
      if (period.start > toDateOnly(new Date()) && retainer.status === "upcoming") {
        // Still show expected for upcoming Solero once period exists
      }
      const hours = hoursInBillingPeriod(retainer, period);
      // Expected: bill hours logged so far, or 0 until logged (hourly).
      // For planning, if no hours yet but period started, show 0 expected until logged —
      // better: expected = hours * rate (actual work), and for future periods skip.
      if (period.end < toDateOnly(new Date()) || period.start <= toDateOnly(new Date())) {
        const amount = estimateInvoiceAmount(retainer, hours);
        if (amount <= 0 && retainer.billing_model === "hourly") continue;
        if (amount <= 0) continue;
        items.push({
          dealId: `retainer:${retainer.id}:${period.key}`,
          projectName: `${retainer.client_name} retainer`,
          companyName: retainer.client_name,
          amount,
          label: `Retainer · ${period.label}`,
        });
      }
    }
  }
  return items.sort((a, b) => b.amount - a.amount);
}

/** Actual = periods marked invoiced whose invoiceMonth matches. */
export function retainerActualForFinanceMonth(
  retainers: RetainerWithEntries[],
  financeMonth: string,
): RevenueBreakdownItem[] {
  const items: RevenueBreakdownItem[] = [];
  for (const retainer of retainers) {
    const invoiced = new Set(normalizeInvoicedPeriods(retainer.invoiced_periods));
    const periods = listRetainerBillingPeriods(retainer, new Date(2100, 0, 1));
    for (const period of periods) {
      if (period.invoiceMonth !== financeMonth) continue;
      if (!invoiced.has(period.key)) continue;
      const hours = hoursInBillingPeriod(retainer, period);
      const amount = estimateInvoiceAmount(retainer, hours);
      if (amount <= 0) continue;
      items.push({
        dealId: `retainer:${retainer.id}:${period.key}`,
        projectName: `${retainer.client_name} retainer`,
        companyName: retainer.client_name,
        amount,
        label: `Gefactureerd · ${period.label}`,
      });
    }
  }
  return items.sort((a, b) => b.amount - a.amount);
}

export function mapRetainerRow(row: Record<string, unknown>): RetainerAgreement {
  const startDate =
    row.start_date == null
      ? ""
      : typeof row.start_date === "string"
        ? row.start_date.slice(0, 10)
        : String(row.start_date).slice(0, 10);

  const today = toDateOnly(new Date());
  let status = (row.status as RetainerAgreement["status"]) ?? "upcoming";
  if (status === "upcoming" && startDate && startDate <= today) {
    status = "active";
  }

  let hourBuckets: RetainerAgreement["hour_buckets"] = [];
  if (Array.isArray(row.hour_buckets)) {
    hourBuckets = row.hour_buckets as RetainerAgreement["hour_buckets"];
  } else if (typeof row.hour_buckets === "string") {
    try {
      hourBuckets = JSON.parse(row.hour_buckets);
    } catch {
      hourBuckets = [];
    }
  }

  let linkedRepos: string[] = [];
  if (Array.isArray(row.linked_repos)) {
    linkedRepos = row.linked_repos.map(String);
  } else if (typeof row.linked_repos === "string") {
    try {
      linkedRepos = JSON.parse(row.linked_repos).map(String);
    } catch {
      linkedRepos = [];
    }
  }

  return {
    id: String(row.id),
    client_name: String(row.client_name),
    company_id: (row.company_id as string | null) ?? null,
    status,
    hours_cadence: (row.hours_cadence as RetainerHoursCadence) ?? "weekly",
    hours_included: Number(row.hours_included) || 0,
    billing_model: (row.billing_model as RetainerBillingModel) ?? "hourly",
    hourly_rate: Number(row.hourly_rate) || 0,
    monthly_fee: Number(row.monthly_fee) || 0,
    start_date: startDate,
    period_anchor: (row.period_anchor as RetainerPeriodAnchor) ?? "calendar",
    flex_hours: Boolean(row.flex_hours),
    invoice_mode: "arrears_monthly",
    invoiced_periods: normalizeInvoicedPeriods(row.invoiced_periods),
    hour_buckets: hourBuckets ?? [],
    linked_repos: linkedRepos,
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function mapTimeEntryRow(row: Record<string, unknown>): RetainerTimeEntry {
  return {
    id: String(row.id),
    retainer_id: String(row.retainer_id),
    week_start:
      typeof row.week_start === "string"
        ? row.week_start.slice(0, 10)
        : String(row.week_start).slice(0, 10),
    hours: Number(row.hours) || 0,
    activity: String(row.activity ?? ""),
    category: (row.category as string | null) ?? null,
    logged_by: (row.logged_by as string | null) ?? null,
    work_date:
      row.work_date == null
        ? null
        : typeof row.work_date === "string"
          ? row.work_date.slice(0, 10)
          : String(row.work_date).slice(0, 10),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

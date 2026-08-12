import { removeVat } from "@/lib/vat";
import {
  ALLOCATION_WEEKLY_HOURS,
  TASK_ASSIGNEES,
  dealContractValue,
  type FinanceDeal,
  type Opportunity,
  type Project,
} from "@/lib/types";

/** Planning floor: fee excl. VAT ÷ this rate = hours you can “afford”. */
export const TARGET_HOURLY_RATE = 175;

export type DealLoadStatus =
  | "ok"
  | "overloaded"
  | "missing_weeks"
  | "missing_value";

export type DealLoadRow = {
  key: string;
  source: "deal" | "opportunity";
  dealId?: string;
  opportunityId?: string;
  projectId?: string | null;
  name: string;
  companyName: string;
  /** Contract value excluding VAT. */
  valueExVat: number;
  /** Manual weekstretch (preferred). */
  weeks: number;
  /** True when weeks came from start/end dates, not delivery_weeks. */
  weeksFromDates: boolean;
  startDate: string | null;
  endDate: string | null;
  /** Hours the fee buys at €175/h. */
  budgetHours: number;
  /** Hours/week across the firm to spend the full budget over the stretch. */
  hoursPerWeekNeeded: number;
  /** Firm weekly capacity (people × hours/week). */
  firmWeeklyHours: number;
  /** Share of firm week this job claims (0–1+). */
  teamLoadPct: number;
  status: DealLoadStatus;
};

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.slice(0, 10) + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
}

function formatWeekKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Inclusive list of Monday week-keys covering [start, end]. */
export function weeksBetween(start: Date, end: Date): string[] {
  if (end < start) return [];
  const weeks: string[] = [];
  let cursor = getMonday(start);
  const last = getMonday(end);
  while (cursor <= last) {
    weeks.push(formatWeekKey(cursor));
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export function budgetHoursForValue(
  valueExVat: number,
  rate = TARGET_HOURLY_RATE,
): number {
  if (valueExVat <= 0 || rate <= 0) return 0;
  return Math.round((valueExVat / rate) * 10) / 10;
}

function resolveWeeks(
  deliveryWeeks: number | null | undefined,
  start: Date | null,
  end: Date | null,
): { weeks: number; fromDates: boolean } {
  const manual = Number(deliveryWeeks);
  if (Number.isFinite(manual) && manual > 0) {
    return { weeks: Math.round(manual * 10) / 10, fromDates: false };
  }
  if (start && end) {
    const count = weeksBetween(start, end).length;
    if (count > 0) return { weeks: count, fromDates: true };
  }
  return { weeks: 0, fromDates: false };
}

function statusFor(row: {
  weeks: number;
  valueExVat: number;
  hoursPerWeekNeeded: number;
  firmWeeklyHours: number;
}): DealLoadStatus {
  if (row.valueExVat <= 0) return "missing_value";
  if (row.weeks <= 0) return "missing_weeks";
  if (row.hoursPerWeekNeeded > row.firmWeeklyHours + 0.5) return "overloaded";
  return "ok";
}

export const DEAL_LOAD_STATUS_LABELS: Record<DealLoadStatus, string> = {
  ok: "Fits at €175/h",
  overloaded: "Needs more than the team",
  missing_weeks: "Set weekstretch",
  missing_value: "Set fee",
};

type BuildArgs = {
  deals: FinanceDeal[];
  projects: Project[];
  opportunities: Opportunity[];
  people?: readonly string[];
  rate?: number;
};

/**
 * Planning model (no time tracking):
 * fee excl. VAT ÷ €175 = hour budget → ÷ manual weekstretch = h/week claim.
 */
export function buildDealLoadRows({
  deals,
  projects,
  opportunities,
  people = TASK_ASSIGNEES,
  rate = TARGET_HOURLY_RATE,
}: BuildArgs): DealLoadRow[] {
  const firmWeeklyHours = people.length * ALLOCATION_WEEKLY_HOURS;
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const dealOpportunityIds = new Set(
    deals.map((d) => d.opportunity_id).filter(Boolean) as string[],
  );

  const rows: DealLoadRow[] = [];

  for (const deal of deals) {
    const project = deal.project_id ? projectById.get(deal.project_id) : undefined;
    const start =
      parseDate(deal.start_date) ?? parseDate(project?.start_date) ?? null;
    const end = parseDate(deal.end_date) ?? parseDate(project?.end_date) ?? null;
    const { weeks, fromDates } = resolveWeeks(deal.delivery_weeks, start, end);
    const valueExVat = removeVat(dealContractValue(deal));
    const budgetHours = budgetHoursForValue(valueExVat, rate);
    const hoursPerWeekNeeded =
      weeks > 0 ? Math.round((budgetHours / weeks) * 10) / 10 : 0;
    const teamLoadPct =
      firmWeeklyHours > 0
        ? Math.round((hoursPerWeekNeeded / firmWeeklyHours) * 1000) / 1000
        : 0;

    rows.push({
      key: `deal:${deal.id}`,
      source: "deal",
      dealId: deal.id,
      opportunityId: deal.opportunity_id ?? undefined,
      projectId: deal.project_id ?? null,
      name: deal.project_name,
      companyName: deal.company_name,
      valueExVat,
      weeks,
      weeksFromDates: fromDates,
      startDate: start ? start.toISOString().slice(0, 10) : null,
      endDate: end ? end.toISOString().slice(0, 10) : null,
      budgetHours,
      hoursPerWeekNeeded,
      firmWeeklyHours,
      teamLoadPct,
      status: statusFor({
        weeks,
        valueExVat,
        hoursPerWeekNeeded,
        firmWeeklyHours,
      }),
    });
  }

  for (const opp of opportunities) {
    if (opp.stage === "won" || opp.stage === "lost") continue;
    if (dealOpportunityIds.has(opp.id)) continue;

    const start = parseDate(opp.start_date);
    const end = parseDate(opp.end_date);
    const { weeks, fromDates } = resolveWeeks(opp.delivery_weeks, start, end);
    const valueExVat = Number(opp.expected_value) || 0;
    const budgetHours = budgetHoursForValue(valueExVat, rate);
    const hoursPerWeekNeeded =
      weeks > 0 ? Math.round((budgetHours / weeks) * 10) / 10 : 0;
    const teamLoadPct =
      firmWeeklyHours > 0
        ? Math.round((hoursPerWeekNeeded / firmWeeklyHours) * 1000) / 1000
        : 0;

    rows.push({
      key: `opp:${opp.id}`,
      source: "opportunity",
      opportunityId: opp.id,
      projectId: null,
      name: opp.name,
      companyName: opp.company?.name ?? "—",
      valueExVat,
      weeks,
      weeksFromDates: fromDates,
      startDate: start ? start.toISOString().slice(0, 10) : null,
      endDate: end ? end.toISOString().slice(0, 10) : null,
      budgetHours,
      hoursPerWeekNeeded,
      firmWeeklyHours,
      teamLoadPct,
      status: statusFor({
        weeks,
        valueExVat,
        hoursPerWeekNeeded,
        firmWeeklyHours,
      }),
    });
  }

  return rows.sort((a, b) => {
    const statusRank: Record<DealLoadStatus, number> = {
      overloaded: 0,
      missing_weeks: 1,
      missing_value: 2,
      ok: 3,
    };
    const sr = statusRank[a.status] - statusRank[b.status];
    if (sr !== 0) return sr;
    return b.budgetHours - a.budgetHours;
  });
}

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

/** Average weeks in a month — used to turn monthly retainer hours into a weekly pace. */
const WEEKS_PER_MONTH = 52 / 12;

export type DealLoadKind = "project" | "retainer";

export type DealLoadStatus =
  | "ok"
  | "overloaded"
  | "missing_deadline"
  | "missing_value"
  | "overdue";

export type DealLoadRow = {
  key: string;
  source: "deal" | "opportunity";
  kind: DealLoadKind;
  dealId?: string;
  opportunityId?: string;
  projectId?: string | null;
  name: string;
  companyName: string;
  /** Fee used for the €175 calc (project total or retainer monthly), excl. VAT. */
  valueExVat: number;
  endDate: string | null;
  /** Weeks left until deadline (projects). Retainers use ~WEEKS_PER_MONTH. */
  weeksRemaining: number;
  /** Hours the fee buys at €175/h (project total, or retainer per month). */
  budgetHours: number;
  /** Hours/week to spend to land at €175 by the deadline / month. */
  hoursPerWeekNeeded: number;
  /** Same pace expressed per month. */
  hoursPerMonthNeeded: number;
  firmWeeklyHours: number;
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

/** Whole weeks from today through the deadline (inclusive of current week). */
export function weeksUntilDeadline(end: Date, today = new Date()): number {
  const start = new Date(today);
  start.setHours(12, 0, 0, 0);
  const deadline = new Date(end);
  deadline.setHours(12, 0, 0, 0);
  if (deadline < start) return 0;
  return Math.max(1, weeksBetween(start, deadline).length);
}

function statusFor(row: {
  kind: DealLoadKind;
  valueExVat: number;
  endDate: string | null;
  weeksRemaining: number;
  hoursPerWeekNeeded: number;
  firmWeeklyHours: number;
}): DealLoadStatus {
  if (row.valueExVat <= 0) return "missing_value";
  if (row.kind === "project") {
    if (!row.endDate) return "missing_deadline";
    if (row.weeksRemaining <= 0) return "overdue";
  }
  if (row.hoursPerWeekNeeded > row.firmWeeklyHours + 0.5) return "overloaded";
  return "ok";
}

export const DEAL_LOAD_STATUS_LABELS: Record<DealLoadStatus, string> = {
  ok: "Fits at €175/h",
  overloaded: "Needs more than the team",
  missing_deadline: "Set deadline",
  missing_value: "Set fee",
  overdue: "Past deadline",
};

type BuildArgs = {
  deals: FinanceDeal[];
  projects: Project[];
  opportunities: Opportunity[];
  people?: readonly string[];
  rate?: number;
  today?: Date;
};

function buildPace(budgetHours: number, weeks: number) {
  const hoursPerWeekNeeded =
    weeks > 0 ? Math.round((budgetHours / weeks) * 10) / 10 : 0;
  const hoursPerMonthNeeded =
    weeks > 0
      ? Math.round(hoursPerWeekNeeded * WEEKS_PER_MONTH * 10) / 10
      : 0;
  return { hoursPerWeekNeeded, hoursPerMonthNeeded };
}

/**
 * Capacity model:
 * - Project: fee ÷ €175 = hour budget; deadline → weeks left → h/week (and h/month).
 * - Retainer: monthly fee ÷ €175 = hours/month included; ongoing weekly pace.
 */
export function buildDealLoadRows({
  deals,
  projects,
  opportunities,
  people = TASK_ASSIGNEES,
  rate = TARGET_HOURLY_RATE,
  today = new Date(),
}: BuildArgs): DealLoadRow[] {
  const firmWeeklyHours = people.length * ALLOCATION_WEEKLY_HOURS;
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const dealOpportunityIds = new Set(
    deals.map((d) => d.opportunity_id).filter(Boolean) as string[],
  );

  const rows: DealLoadRow[] = [];

  for (const deal of deals) {
    const project = deal.project_id ? projectById.get(deal.project_id) : undefined;
    const kind: DealLoadKind = deal.deal_type === "retainer" ? "retainer" : "project";
    const end =
      parseDate(deal.end_date) ?? parseDate(project?.end_date) ?? null;

    let valueExVat = 0;
    let budgetHours = 0;
    let weeksRemaining = 0;
    let hoursPerWeekNeeded = 0;
    let hoursPerMonthNeeded = 0;

    if (kind === "retainer") {
      valueExVat = removeVat(
        (Number(deal.monthly_fee) || 0) + (Number(deal.monthly_revshare) || 0),
      );
      // Monthly fee at €175 → hours included each month.
      budgetHours = budgetHoursForValue(valueExVat, rate);
      weeksRemaining = Math.round(WEEKS_PER_MONTH * 10) / 10;
      hoursPerMonthNeeded = budgetHours;
      hoursPerWeekNeeded =
        Math.round((budgetHours / WEEKS_PER_MONTH) * 10) / 10;
    } else {
      valueExVat = removeVat(dealContractValue(deal));
      budgetHours = budgetHoursForValue(valueExVat, rate);
      weeksRemaining = end ? weeksUntilDeadline(end, today) : 0;
      const pace = buildPace(budgetHours, weeksRemaining);
      hoursPerWeekNeeded = pace.hoursPerWeekNeeded;
      hoursPerMonthNeeded = pace.hoursPerMonthNeeded;
    }

    const teamLoadPct =
      firmWeeklyHours > 0
        ? Math.round((hoursPerWeekNeeded / firmWeeklyHours) * 1000) / 1000
        : 0;

    rows.push({
      key: `deal:${deal.id}`,
      source: "deal",
      kind,
      dealId: deal.id,
      opportunityId: deal.opportunity_id ?? undefined,
      projectId: deal.project_id ?? null,
      name: deal.project_name,
      companyName: deal.company_name,
      valueExVat,
      endDate: end ? end.toISOString().slice(0, 10) : null,
      weeksRemaining,
      budgetHours,
      hoursPerWeekNeeded,
      hoursPerMonthNeeded,
      firmWeeklyHours,
      teamLoadPct,
      status: statusFor({
        kind,
        valueExVat,
        endDate: end ? end.toISOString().slice(0, 10) : null,
        weeksRemaining,
        hoursPerWeekNeeded,
        firmWeeklyHours,
      }),
    });
  }

  for (const opp of opportunities) {
    if (opp.stage === "won" || opp.stage === "lost") continue;
    if (dealOpportunityIds.has(opp.id)) continue;

    const kind: DealLoadKind = opp.type === "retainer" ? "retainer" : "project";
    const end = parseDate(opp.end_date);
    const valueExVat = Number(opp.expected_value) || 0;
    let budgetHours = 0;
    let weeksRemaining = 0;
    let hoursPerWeekNeeded = 0;
    let hoursPerMonthNeeded = 0;

    if (kind === "retainer") {
      // Pipeline retainer: expected_value treated as monthly fee excl. VAT.
      budgetHours = budgetHoursForValue(valueExVat, rate);
      weeksRemaining = Math.round(WEEKS_PER_MONTH * 10) / 10;
      hoursPerMonthNeeded = budgetHours;
      hoursPerWeekNeeded =
        Math.round((budgetHours / WEEKS_PER_MONTH) * 10) / 10;
    } else {
      budgetHours = budgetHoursForValue(valueExVat, rate);
      weeksRemaining = end ? weeksUntilDeadline(end, today) : 0;
      const pace = buildPace(budgetHours, weeksRemaining);
      hoursPerWeekNeeded = pace.hoursPerWeekNeeded;
      hoursPerMonthNeeded = pace.hoursPerMonthNeeded;
    }

    const teamLoadPct =
      firmWeeklyHours > 0
        ? Math.round((hoursPerWeekNeeded / firmWeeklyHours) * 1000) / 1000
        : 0;

    rows.push({
      key: `opp:${opp.id}`,
      source: "opportunity",
      kind,
      opportunityId: opp.id,
      projectId: null,
      name: opp.name,
      companyName: opp.company?.name ?? "—",
      valueExVat,
      endDate: end ? end.toISOString().slice(0, 10) : null,
      weeksRemaining,
      budgetHours,
      hoursPerWeekNeeded,
      hoursPerMonthNeeded,
      firmWeeklyHours,
      teamLoadPct,
      status: statusFor({
        kind,
        valueExVat,
        endDate: end ? end.toISOString().slice(0, 10) : null,
        weeksRemaining,
        hoursPerWeekNeeded,
        firmWeeklyHours,
      }),
    });
  }

  return rows.sort((a, b) => {
    const statusRank: Record<DealLoadStatus, number> = {
      overloaded: 0,
      overdue: 1,
      missing_deadline: 2,
      missing_value: 3,
      ok: 4,
    };
    const sr = statusRank[a.status] - statusRank[b.status];
    if (sr !== 0) return sr;
    return b.hoursPerWeekNeeded - a.hoursPerWeekNeeded;
  });
}

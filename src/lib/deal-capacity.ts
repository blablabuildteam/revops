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
  /** When false (default), only confirmed finance deals — no open opportunities. */
  includePipeline?: boolean;
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
  includePipeline = false,
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

  if (includePipeline) {
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

export type WeeklyJobSlice = {
  key: string;
  name: string;
  companyName: string;
  kind: DealLoadKind;
  source: "deal" | "opportunity";
  hours: number;
};

export type WeeklyCapacityColumn = {
  weekKey: string;
  weekStart: Date;
  totalHours: number;
  firmWeeklyHours: number;
  /** totalHours / firmWeeklyHours */
  loadPct: number;
  jobs: WeeklyJobSlice[];
};

export type MonthlyCapacityColumn = {
  monthKey: string;
  label: string;
  year: number;
  monthIndex: number;
  totalHours: number;
  firmHours: number;
  /** totalHours / firmHours for the month */
  loadPct: number;
  weekCount: number;
  jobs: WeeklyJobSlice[];
};

/**
 * Spread each job’s €175 pace evenly across weeks:
 * - Project: today → deadline
 * - Retainer: every week in the horizon
 */
export function buildWeeklyCapacity({
  rows,
  weekCount = 12,
  weekOffset = 0,
  today = new Date(),
}: {
  rows: DealLoadRow[];
  weekCount?: number;
  weekOffset?: number;
  today?: Date;
}): WeeklyCapacityColumn[] {
  const firmWeeklyHours =
    rows[0]?.firmWeeklyHours ?? TASK_ASSIGNEES.length * ALLOCATION_WEEKLY_HOURS;
  const startMonday = getMonday(today);
  startMonday.setDate(startMonday.getDate() + weekOffset * 7);

  const columns: WeeklyCapacityColumn[] = [];
  for (let i = 0; i < weekCount; i++) {
    const weekStart = new Date(startMonday);
    weekStart.setDate(weekStart.getDate() + i * 7);
    columns.push({
      weekKey: formatWeekKey(weekStart),
      weekStart,
      totalHours: 0,
      firmWeeklyHours,
      loadPct: 0,
      jobs: [],
    });
  }

  const byKey = new Map(columns.map((c) => [c.weekKey, c]));
  if (columns.length === 0) return columns;

  for (const row of rows) {
    if (row.hoursPerWeekNeeded <= 0) continue;

    let weekKeys: string[] = [];
    if (row.kind === "retainer") {
      weekKeys = columns.map((c) => c.weekKey);
    } else if (row.endDate) {
      const end = parseDate(row.endDate);
      if (!end) continue;
      const from = getMonday(today);
      weekKeys = weeksBetween(from, end).filter((key) => byKey.has(key));
    }

    for (const key of weekKeys) {
      const col = byKey.get(key);
      if (!col) continue;
      col.jobs.push({
        key: row.key,
        name: row.name,
        companyName: row.companyName,
        kind: row.kind,
        source: row.source,
        hours: row.hoursPerWeekNeeded,
      });
      col.totalHours += row.hoursPerWeekNeeded;
    }
  }

  for (const col of columns) {
    col.totalHours = Math.round(col.totalHours * 10) / 10;
    col.loadPct =
      firmWeeklyHours > 0
        ? Math.round((col.totalHours / firmWeeklyHours) * 1000) / 1000
        : 0;
    col.jobs.sort((a, b) => b.hours - a.hours);
  }

  return columns;
}

/** Roll weekly €175 load up into calendar months. */
export function buildMonthlyCapacity({
  rows,
  monthCount = 6,
  monthOffset = 0,
  today = new Date(),
}: {
  rows: DealLoadRow[];
  monthCount?: number;
  monthOffset?: number;
  today?: Date;
}): MonthlyCapacityColumn[] {
  const firmWeeklyHours =
    rows[0]?.firmWeeklyHours ?? TASK_ASSIGNEES.length * ALLOCATION_WEEKLY_HOURS;

  const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const firstMonday = getMonday(base);
  const todayMonday = getMonday(today);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + monthCount, 0);
  const weekCount = Math.max(4, weeksBetween(firstMonday, lastDay).length + 1);
  const weekOffset = Math.round(
    (firstMonday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
  const weeks = buildWeeklyCapacity({
    rows,
    weekCount,
    weekOffset,
    today,
  });

  const months: MonthlyCapacityColumn[] = [];
  for (let i = 0; i < monthCount; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    months.push({
      monthKey,
      label,
      year: d.getFullYear(),
      monthIndex: d.getMonth(),
      totalHours: 0,
      firmHours: 0,
      loadPct: 0,
      weekCount: 0,
      jobs: [],
    });
  }

  const byMonth = new Map(months.map((m) => [m.monthKey, m]));
  const jobHours = new Map<string, Map<string, WeeklyJobSlice>>();

  for (const week of weeks) {
    const y = week.weekStart.getFullYear();
    const m = week.weekStart.getMonth();
    const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
    const col = byMonth.get(monthKey);
    if (!col) continue;
    col.totalHours += week.totalHours;
    col.weekCount += 1;
    col.firmHours += firmWeeklyHours;

    let map = jobHours.get(monthKey);
    if (!map) {
      map = new Map();
      jobHours.set(monthKey, map);
    }
    for (const job of week.jobs) {
      const existing = map.get(job.key);
      if (existing) {
        existing.hours += job.hours;
      } else {
        map.set(job.key, { ...job });
      }
    }
  }

  for (const col of months) {
    col.totalHours = Math.round(col.totalHours * 10) / 10;
    col.firmHours = Math.round(col.firmHours * 10) / 10;
    col.loadPct =
      col.firmHours > 0
        ? Math.round((col.totalHours / col.firmHours) * 1000) / 1000
        : 0;
    const map = jobHours.get(col.monthKey);
    col.jobs = map
      ? [...map.values()]
          .map((j) => ({ ...j, hours: Math.round(j.hours * 10) / 10 }))
          .sort((a, b) => b.hours - a.hours)
      : [];
  }

  return months;
}

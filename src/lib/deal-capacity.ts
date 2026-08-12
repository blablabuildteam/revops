import { removeVat } from "@/lib/vat";
import {
  ALLOCATION_WEEKLY_HOURS,
  TASK_ASSIGNEES,
  dealContractValue,
  type Allocation,
  type FinanceDeal,
  type Opportunity,
  type Project,
} from "@/lib/types";

/** Minimum billable rate the partners want to earn, excl. VAT. */
export const TARGET_HOURLY_RATE = 175;

export type DealLoadStatus =
  | "ok"
  | "under_allocated"
  | "over_scoped"
  | "no_capacity"
  | "missing_dates"
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
  startDate: string | null;
  endDate: string | null;
  weeks: number;
  /** Hours you can spend and still hit €175/h. */
  budgetHours: number;
  /** Hours/week needed across the firm to hit the rate. */
  hoursPerWeekNeeded: number;
  /** Hours already planned on this target in the window. */
  allocatedHours: number;
  /** Firm free capacity (unused %) in the same weeks. */
  freeHours: number;
  /** What the effective rate would be if you burn all allocated hours. */
  effectiveRate: number | null;
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

function normalizeWeekKey(week: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return week;
  const parsed = new Date(week);
  if (!Number.isNaN(parsed.getTime())) return formatWeekKey(parsed);
  return week.slice(0, 10);
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

function statusFor(row: Omit<DealLoadRow, "status" | "key" | "source" | "name" | "companyName"> & {
  weeks: number;
  valueExVat: number;
}): DealLoadStatus {
  if (!row.startDate || !row.endDate) return "missing_dates";
  if (row.valueExVat <= 0) return "missing_value";
  if (row.weeks <= 0) return "missing_dates";
  if (row.allocatedHours > row.budgetHours * 1.05) return "over_scoped";
  if (row.hoursPerWeekNeeded > 0 && row.freeHours + row.allocatedHours + 0.5 < row.budgetHours) {
    return "no_capacity";
  }
  if (row.allocatedHours + 0.5 < row.budgetHours * 0.5 && row.budgetHours >= 8) {
    return "under_allocated";
  }
  return "ok";
}

export const DEAL_LOAD_STATUS_LABELS: Record<DealLoadStatus, string> = {
  ok: "On track",
  under_allocated: "Under-planned",
  over_scoped: "Below €175/h",
  no_capacity: "Not enough capacity",
  missing_dates: "Missing dates",
  missing_value: "Missing value",
};

type BuildArgs = {
  deals: FinanceDeal[];
  projects: Project[];
  opportunities: Opportunity[];
  allocations: Allocation[];
  people?: readonly string[];
  rate?: number;
  /** Only include deals/projects that overlap this window (default: today → +16 weeks). */
  horizonWeeks?: number;
};

/**
 * For each active finance deal (and open opportunity without a deal), compute
 * how many hours the €175 floor allows within the delivery window, and how
 * that compares to allocation + free capacity.
 */
export function buildDealLoadRows({
  deals,
  projects,
  opportunities,
  allocations,
  people = TASK_ASSIGNEES,
  rate = TARGET_HOURLY_RATE,
  horizonWeeks = 16,
}: BuildArgs): DealLoadRow[] {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const horizonEnd = new Date(today);
  horizonEnd.setDate(horizonEnd.getDate() + horizonWeeks * 7);

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const dealOpportunityIds = new Set(
    deals.map((d) => d.opportunity_id).filter(Boolean) as string[],
  );

  // Pre-index allocations: week → person → list of {target, %}
  const byWeekPerson = new Map<string, Map<string, { targetType: string; targetId: string; pct: number }[]>>();
  for (const a of allocations) {
    const week = normalizeWeekKey(a.week);
    if (!people.includes(a.person)) continue;
    let perPerson = byWeekPerson.get(week);
    if (!perPerson) {
      perPerson = new Map();
      byWeekPerson.set(week, perPerson);
    }
    const list = perPerson.get(a.person) ?? [];
    list.push({
      targetType: a.target_type,
      targetId: a.target_id,
      pct: Number(a.percentage) || 0,
    });
    perPerson.set(a.person, list);
  }

  function allocatedHoursFor(
    weekKeys: string[],
    match: (targetType: string, targetId: string) => boolean,
  ): number {
    let hours = 0;
    for (const week of weekKeys) {
      const perPerson = byWeekPerson.get(week);
      if (!perPerson) continue;
      for (const person of people) {
        const cells = perPerson.get(person) ?? [];
        for (const cell of cells) {
          if (match(cell.targetType, cell.targetId)) {
            hours += (cell.pct / 100) * ALLOCATION_WEEKLY_HOURS;
          }
        }
      }
    }
    return Math.round(hours * 10) / 10;
  }

  function freeHoursFor(weekKeys: string[]): number {
    let hours = 0;
    for (const week of weekKeys) {
      const perPerson = byWeekPerson.get(week);
      for (const person of people) {
        const cells = perPerson?.get(person) ?? [];
        const used = cells.reduce((sum, c) => sum + c.pct, 0);
        const freePct = Math.max(0, 100 - used);
        hours += (freePct / 100) * ALLOCATION_WEEKLY_HOURS;
      }
    }
    return Math.round(hours * 10) / 10;
  }

  function overlapsHorizon(start: Date | null, end: Date | null): boolean {
    if (!start || !end) return true; // keep visible so the missing-dates flag shows
    return end >= today && start <= horizonEnd;
  }

  const rows: DealLoadRow[] = [];

  for (const deal of deals) {
    const project = deal.project_id ? projectById.get(deal.project_id) : undefined;
    const start =
      parseDate(deal.start_date) ??
      parseDate(project?.start_date) ??
      null;
    const end =
      parseDate(deal.end_date) ??
      parseDate(project?.end_date) ??
      null;

    if (!overlapsHorizon(start, end)) continue;

    // Skip retainers without a finite window — the rate check is for scoped work.
    if (deal.deal_type === "retainer" && (!start || !end)) continue;

    const valueExVat = removeVat(dealContractValue(deal));
    const weekKeys = start && end ? weeksBetween(start, end) : [];
    const weeks = weekKeys.length;
    const budgetHours = budgetHoursForValue(valueExVat, rate);
    const hoursPerWeekNeeded = weeks > 0 ? Math.round((budgetHours / weeks) * 10) / 10 : 0;

    const projectId = deal.project_id ?? null;
    const opportunityId = deal.opportunity_id ?? undefined;

    const allocatedHours = allocatedHoursFor(weekKeys, (type, id) => {
      if (projectId && type === "project" && id === projectId) return true;
      if (opportunityId && type === "opportunity" && id === opportunityId) return true;
      return false;
    });
    const freeHours = freeHoursFor(weekKeys);
    const effectiveRate =
      allocatedHours > 0 ? Math.round((valueExVat / allocatedHours) * 10) / 10 : null;

    const base = {
      dealId: deal.id,
      opportunityId,
      projectId,
      valueExVat,
      startDate: start ? start.toISOString().slice(0, 10) : null,
      endDate: end ? end.toISOString().slice(0, 10) : null,
      weeks,
      budgetHours,
      hoursPerWeekNeeded,
      allocatedHours,
      freeHours,
      effectiveRate,
    };

    rows.push({
      key: `deal:${deal.id}`,
      source: "deal",
      name: deal.project_name,
      companyName: deal.company_name,
      ...base,
      status: statusFor(base),
    });
  }

  // Open opportunities that do not yet have a finance deal.
  for (const opp of opportunities) {
    if (opp.stage === "won" || opp.stage === "lost") continue;
    if (dealOpportunityIds.has(opp.id)) continue;

    const start = parseDate(opp.start_date);
    const end = parseDate(opp.end_date);
    if (!overlapsHorizon(start, end)) continue;

    const valueExVat = Number(opp.expected_value) || 0;
    const weekKeys = start && end ? weeksBetween(start, end) : [];
    const weeks = weekKeys.length;
    const budgetHours = budgetHoursForValue(valueExVat, rate);
    const hoursPerWeekNeeded = weeks > 0 ? Math.round((budgetHours / weeks) * 10) / 10 : 0;

    const allocatedHours = allocatedHoursFor(
      weekKeys,
      (type, id) => type === "opportunity" && id === opp.id,
    );
    const freeHours = freeHoursFor(weekKeys);
    const effectiveRate =
      allocatedHours > 0 ? Math.round((valueExVat / allocatedHours) * 10) / 10 : null;

    const base = {
      opportunityId: opp.id,
      projectId: null as string | null,
      valueExVat,
      startDate: start ? start.toISOString().slice(0, 10) : null,
      endDate: end ? end.toISOString().slice(0, 10) : null,
      weeks,
      budgetHours,
      hoursPerWeekNeeded,
      allocatedHours,
      freeHours,
      effectiveRate,
    };

    rows.push({
      key: `opp:${opp.id}`,
      source: "opportunity",
      name: opp.name,
      companyName: opp.company?.name ?? "—",
      ...base,
      status: statusFor(base),
    });
  }

  return rows.sort((a, b) => {
    // Flagged first, then soonest end date.
    const statusRank: Record<DealLoadStatus, number> = {
      no_capacity: 0,
      over_scoped: 1,
      under_allocated: 2,
      missing_dates: 3,
      missing_value: 4,
      ok: 5,
    };
    const sr = statusRank[a.status] - statusRank[b.status];
    if (sr !== 0) return sr;
    return (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999");
  });
}

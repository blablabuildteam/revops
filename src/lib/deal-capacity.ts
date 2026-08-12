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

/** Planning floor: fee excl. VAT ÷ this rate = hours you can “afford”. */
export const TARGET_HOURLY_RATE = 175;

export type DealLoadStatus =
  | "ok"
  | "overloaded"
  | "tight"
  | "over_planned"
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
  /** Hours the fee buys at €175/h. */
  budgetHours: number;
  /** Hours/week the job needs across the firm to hit that budget. */
  hoursPerWeekNeeded: number;
  /** Firm weekly capacity (people × hours/week). */
  firmWeeklyHours: number;
  /** Share of firm week this job claims (0–1+). */
  teamLoadPct: number;
  /**
   * Free hours left in the window after other overlapping jobs
   * have claimed their €175 budgets (this job excluded).
   */
  freeHours: number;
  /** Optional: hours sketched on the week grid for this job. */
  plannedHours: number;
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

function statusFor(row: {
  startDate: string | null;
  endDate: string | null;
  weeks: number;
  valueExVat: number;
  hoursPerWeekNeeded: number;
  firmWeeklyHours: number;
  freeHours: number;
  budgetHours: number;
  plannedHours: number;
}): DealLoadStatus {
  if (!row.startDate || !row.endDate || row.weeks <= 0) return "missing_dates";
  if (row.valueExVat <= 0) return "missing_value";
  // Single job already needs more than the whole team can give in a week.
  if (row.hoursPerWeekNeeded > row.firmWeeklyHours + 0.5) return "overloaded";
  // Other work leaves too little room for this budget before the deadline.
  if (row.budgetHours > row.freeHours + 0.5) return "tight";
  // Optional week-grid sketch spends more hours than the fee buys.
  if (row.plannedHours > row.budgetHours * 1.05) return "over_planned";
  return "ok";
}

export const DEAL_LOAD_STATUS_LABELS: Record<DealLoadStatus, string> = {
  ok: "Fits at €175/h",
  overloaded: "Needs more than the team",
  tight: "Calendar too full",
  over_planned: "Sketch above budget",
  missing_dates: "Set start & end",
  missing_value: "Set fee",
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

type DraftRow = {
  key: string;
  source: "deal" | "opportunity";
  dealId?: string;
  opportunityId?: string;
  projectId?: string | null;
  name: string;
  companyName: string;
  valueExVat: number;
  startDate: string | null;
  endDate: string | null;
  weeks: number;
  weekKeys: string[];
  budgetHours: number;
  hoursPerWeekNeeded: number;
  plannedHours: number;
};

/**
 * Planning model (no time tracking required):
 * fee excl. VAT ÷ €175 = hour budget → ÷ delivery weeks = h/week claim.
 * Stack those claims on the calendar against firm weekly capacity.
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

  const firmWeeklyHours = people.length * ALLOCATION_WEEKLY_HOURS;
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const dealOpportunityIds = new Set(
    deals.map((d) => d.opportunity_id).filter(Boolean) as string[],
  );

  // Optional week-grid sketches (not required for the €175 calc).
  const byWeekPerson = new Map<
    string,
    Map<string, { targetType: string; targetId: string; pct: number }[]>
  >();
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

  function plannedHoursFor(
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

  function overlapsHorizon(start: Date | null, end: Date | null): boolean {
    if (!start || !end) return true;
    return end >= today && start <= horizonEnd;
  }

  const drafts: DraftRow[] = [];

  for (const deal of deals) {
    const project = deal.project_id ? projectById.get(deal.project_id) : undefined;
    const start =
      parseDate(deal.start_date) ?? parseDate(project?.start_date) ?? null;
    const end = parseDate(deal.end_date) ?? parseDate(project?.end_date) ?? null;

    if (!overlapsHorizon(start, end)) continue;
    if (deal.deal_type === "retainer" && (!start || !end)) continue;

    const valueExVat = removeVat(dealContractValue(deal));
    const weekKeys = start && end ? weeksBetween(start, end) : [];
    const weeks = weekKeys.length;
    const budgetHours = budgetHoursForValue(valueExVat, rate);
    const hoursPerWeekNeeded =
      weeks > 0 ? Math.round((budgetHours / weeks) * 10) / 10 : 0;

    const projectId = deal.project_id ?? null;
    const opportunityId = deal.opportunity_id ?? undefined;

    drafts.push({
      key: `deal:${deal.id}`,
      source: "deal",
      dealId: deal.id,
      opportunityId,
      projectId,
      name: deal.project_name,
      companyName: deal.company_name,
      valueExVat,
      startDate: start ? start.toISOString().slice(0, 10) : null,
      endDate: end ? end.toISOString().slice(0, 10) : null,
      weeks,
      weekKeys,
      budgetHours,
      hoursPerWeekNeeded,
      plannedHours: plannedHoursFor(weekKeys, (type, id) => {
        if (projectId && type === "project" && id === projectId) return true;
        if (opportunityId && type === "opportunity" && id === opportunityId) return true;
        return false;
      }),
    });
  }

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
    const hoursPerWeekNeeded =
      weeks > 0 ? Math.round((budgetHours / weeks) * 10) / 10 : 0;

    drafts.push({
      key: `opp:${opp.id}`,
      source: "opportunity",
      opportunityId: opp.id,
      projectId: null,
      name: opp.name,
      companyName: opp.company?.name ?? "—",
      valueExVat,
      startDate: start ? start.toISOString().slice(0, 10) : null,
      endDate: end ? end.toISOString().slice(0, 10) : null,
      weeks,
      weekKeys,
      budgetHours,
      hoursPerWeekNeeded,
      plannedHours: plannedHoursFor(
        weekKeys,
        (type, id) => type === "opportunity" && id === opp.id,
      ),
    });
  }

  // Stack every job’s h/week claim onto the calendar.
  const weekLoad = new Map<string, number>();
  for (const draft of drafts) {
    for (const week of draft.weekKeys) {
      weekLoad.set(week, (weekLoad.get(week) ?? 0) + draft.hoursPerWeekNeeded);
    }
  }

  const rows: DealLoadRow[] = drafts.map((draft) => {
    let freeHours = 0;
    for (const week of draft.weekKeys) {
      const total = weekLoad.get(week) ?? 0;
      const others = Math.max(0, total - draft.hoursPerWeekNeeded);
      freeHours += Math.max(0, firmWeeklyHours - others);
    }
    freeHours = Math.round(freeHours * 10) / 10;

    const teamLoadPct =
      firmWeeklyHours > 0
        ? Math.round((draft.hoursPerWeekNeeded / firmWeeklyHours) * 1000) / 1000
        : 0;

    const base = {
      startDate: draft.startDate,
      endDate: draft.endDate,
      weeks: draft.weeks,
      valueExVat: draft.valueExVat,
      hoursPerWeekNeeded: draft.hoursPerWeekNeeded,
      firmWeeklyHours,
      freeHours,
      budgetHours: draft.budgetHours,
      plannedHours: draft.plannedHours,
    };

    return {
      key: draft.key,
      source: draft.source,
      dealId: draft.dealId,
      opportunityId: draft.opportunityId,
      projectId: draft.projectId,
      name: draft.name,
      companyName: draft.companyName,
      valueExVat: draft.valueExVat,
      startDate: draft.startDate,
      endDate: draft.endDate,
      weeks: draft.weeks,
      budgetHours: draft.budgetHours,
      hoursPerWeekNeeded: draft.hoursPerWeekNeeded,
      firmWeeklyHours,
      teamLoadPct,
      freeHours,
      plannedHours: draft.plannedHours,
      status: statusFor(base),
    };
  });

  return rows.sort((a, b) => {
    const statusRank: Record<DealLoadStatus, number> = {
      overloaded: 0,
      tight: 1,
      over_planned: 2,
      missing_dates: 3,
      missing_value: 4,
      ok: 5,
    };
    const sr = statusRank[a.status] - statusRank[b.status];
    if (sr !== 0) return sr;
    return (a.endDate ?? "9999").localeCompare(b.endDate ?? "9999");
  });
}

import { addVat } from "@/lib/vat";

export type Stage =
  | "prospect"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost"
  | "on_hold";

export type OpportunityType =
  | "new"
  | "project"
  | "retainer";

export type Sentiment =
  | "very_positive"
  | "positive"
  | "neutral"
  | "negative"
  | "very_negative";

export type ProposalStatus =
  | "not_sent"
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired";

export type ActivityType =
  | "call"
  | "email"
  | "meeting"
  | "note"
  | "proposal"
  | "follow_up";

export type RetainerType = "none" | "fixed" | "commission";

export interface Company {
  id: string;
  name: string;
  industry?: string;
  website?: string;
  country?: string;
  logo_url?: string | null;
  retainer_type?: RetainerType;
  retainer_amount?: number;
  commission_pct?: number;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  company_id?: string;
  company?: Company;
  name: string;
  description?: string;
  type: OpportunityType;
  stage: Stage;
  probability: number;
  expected_value: number;
  actual_value: number;
  weighted_value: number;
  currency: string;
  sentiment: Sentiment;
  proposal_status?: ProposalStatus;
  proposal_url?: string;
  owner?: string;
  close_date?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  opportunity_id: string;
  type: ActivityType;
  title: string;
  notes?: string;
  date: string;
  created_at: string;
}

export type NewOpportunity = Omit<
  Opportunity,
  "id" | "weighted_value" | "created_at" | "updated_at" | "company"
>;

export const STAGE_LABELS: Record<Stage, string> = {
  prospect: "Prospect",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
  on_hold: "On Hold",
};

export const STAGE_ORDER: Stage[] = [
  "prospect",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
  "on_hold",
];

export const TYPE_LABELS: Record<OpportunityType, string> = {
  new: "New",
  project: "Project",
  retainer: "Retainer",
};

export function normalizeOpportunityType(type: string): OpportunityType {
  if (type === "new" || type === "project" || type === "retainer") return type;
  if (type === "new_business" || type === "upsell") return "new";
  if (type === "renewal") return "retainer";
  return "new";
}

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  very_positive: "Very positive",
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  very_negative: "Very negative",
};

export type ProjectStatus = "active" | "on_hold" | "completed" | "cancelled";
export type TaskStatus = "open" | "in_progress" | "done";
export type MilestoneStatus = "pending" | "in_progress" | "completed";

export interface Project {
  id: string;
  opportunity_id?: string;
  company_id?: string;
  company?: Company;
  opportunity?: Opportunity;
  name: string;
  description?: string;
  status: ProjectStatus;
  share_token: string;
  edit_token?: string | null;
  client_name?: string;
  client_email?: string;
  start_date?: string;
  end_date?: string;
  milestones?: Milestone[];
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  position: number;
  status: MilestoneStatus;
  due_date?: string;
  color?: string;
  tasks: Task[];
  created_at: string;
  updated_at: string;
}

export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  project_id: string;
  milestone_id?: string | null;
  parent_id?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  created_by: "team" | "client";
  approved: boolean;
  assignee?: string | null;
  due_date?: string | null;
  url?: string | null;
  priority: TaskPriority;
  position: number;
  comment_count?: number;
  has_attachments?: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_user_id?: string | null;
  author_name: string;
  body: string;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  content_type: string;
  uploaded_by_user_id?: string | null;
  uploaded_by_name: string;
  created_at: string;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

export const TASK_ASSIGNEES = ["Kevin", "Xennith"] as const;

export type AllocationTargetType = "project" | "opportunity" | "generic";

export const ALLOCATION_GENERIC_ID = "general";

export interface Allocation {
  id: string;
  person: string;
  target_type: AllocationTargetType;
  target_id: string;
  week: string;
  percentage: number;
  created_at: string;
  updated_at: string;
}

export const ALLOCATION_PERCENT_PRESETS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

/** Full-time week used to convert between hours and stored percentages. */
export const ALLOCATION_WEEKLY_HOURS = 40;

export type AllocationUnit = "percent" | "hours";

export const ALLOCATION_HOUR_PRESETS = [1, 2, 4, 8, 12, 16, 20, 24, 32, 40] as const;

export const ALLOCATION_DEFAULT_UNIT: Record<string, AllocationUnit> = {
  Kevin: "hours",
  Xennith: "percent",
};

/** Round to 2 decimal places (enough for 0.1h steps on a 40h week). */
export function clampAllocationPercent(percentage: number): number {
  return Math.max(0, Math.min(100, Math.round(percentage * 100) / 100));
}

export function percentToHours(percentage: number): number {
  return Math.round((percentage / 100) * ALLOCATION_WEEKLY_HOURS * 10) / 10;
}

export function hoursToPercent(hours: number): number {
  return clampAllocationPercent((hours / ALLOCATION_WEEKLY_HOURS) * 100);
}

export function formatAllocationHours(hours: number): string {
  if (hours <= 0) return "–";
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

export function formatAllocationPercent(percentage: number): string {
  if (percentage <= 0) return "–";
  const rounded = clampAllocationPercent(percentage);
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: "Planned",
  in_progress: "In progress",
  completed: "Completed",
};

export const DEFAULT_PROJECT_MILESTONES = [
  "Backlog",
  "Open",
  "Up Next",
  "In Progress",
  "On Hold",
  "Done",
] as const;

export const DEFAULT_PHASE_COLORS: Record<(typeof DEFAULT_PROJECT_MILESTONES)[number], string> = {
  Backlog: "#9ca3af",
  Open: "#60a5fa",
  "Up Next": "#c084fc",
  "In Progress": "#e8ff47",
  "On Hold": "#f87171",
  Done: "#4ade80",
};

export const CUSTOM_PHASE_DEFAULT_COLOR = "#e5e5e5";

export function resolvePhaseColor(name: string, color?: string | null): string {
  if (color) return color;
  return DEFAULT_PHASE_COLORS[name as (typeof DEFAULT_PROJECT_MILESTONES)[number]] ?? CUSTOM_PHASE_DEFAULT_COLOR;
}

export function defaultColorForPhaseName(name: string): string {
  return DEFAULT_PHASE_COLORS[name as (typeof DEFAULT_PROJECT_MILESTONES)[number]] ?? CUSTOM_PHASE_DEFAULT_COLOR;
}

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  not_sent: "Not sent",
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export type DealType = "project" | "retainer";

export interface PaymentScheduleEntry {
  month: string;
  percentage: number;
}

export interface DealPaymentEntry {
  date: string;
  amount: number;
}

export interface FinanceDeal {
  id: string;
  opportunity_id?: string;
  project_id?: string;
  company_id?: string;
  company_name: string;
  project_name: string;
  deal_type: DealType;
  total_deal_value: number;
  start_date?: string;
  end_date?: string;
  payment_schedule: PaymentScheduleEntry[];
  payments: DealPaymentEntry[];
  monthly_fee: number;
  monthly_revshare: number;
  amount_paid: number;
  created_at: string;
  updated_at: string;
}

export type NewFinanceDeal = Omit<FinanceDeal, "id" | "created_at" | "updated_at">;

export type UpdateFinanceDeal = Partial<
  Omit<NewFinanceDeal, "start_date" | "end_date">
> & {
  start_date?: string | null;
  end_date?: string | null;
  payments?: DealPaymentEntry[];
};

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  project: "Project",
  retainer: "Retainer",
};

export function sumDealPayments(payments: DealPaymentEntry[]): number {
  return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export function dealContractValue(
  deal: Pick<FinanceDeal, "deal_type" | "total_deal_value" | "monthly_fee" | "monthly_revshare" | "start_date" | "end_date">
): number {
  if (deal.deal_type === "project") return Number(deal.total_deal_value) || 0;
  if (!deal.start_date || !deal.end_date) return 0;
  const start = new Date(deal.start_date);
  const end = new Date(deal.end_date);
  const months = Math.max(
    1,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  );
  return months * ((Number(deal.monthly_fee) || 0) + (Number(deal.monthly_revshare) || 0));
}

export function dealOutstanding(deal: Pick<FinanceDeal, "deal_type" | "total_deal_value" | "monthly_fee" | "monthly_revshare" | "start_date" | "end_date" | "amount_paid">): number {
  return Math.max(0, dealContractValue(deal) - (Number(deal.amount_paid) || 0));
}

const SALARY_MONTHLY = 9000;
const INCOME_TAX_PCT = 0.4;

export interface RevenueBreakdownItem {
  dealId: string;
  projectName: string;
  companyName: string;
  amount: number;
  label: string;
}

export function expectedRevenueBreakdownForMonth(
  deals: FinanceDeal[],
  month: string,
): RevenueBreakdownItem[] {
  const items: RevenueBreakdownItem[] = [];

  for (const deal of deals) {
    if (deal.deal_type === "project") {
      for (const entry of deal.payment_schedule ?? []) {
        if (entry.month !== month) continue;
        const amount =
          ((Number(entry.percentage) || 0) / 100) * (Number(deal.total_deal_value) || 0);
        if (amount <= 0) continue;
        items.push({
          dealId: deal.id,
          projectName: deal.project_name,
          companyName: deal.company_name,
          amount,
          label: `${entry.percentage}% payment`,
        });
      }
    } else if (deal.deal_type === "retainer") {
      if (!deal.start_date || !deal.end_date) continue;
      const start = deal.start_date.slice(0, 7);
      const end = deal.end_date.slice(0, 7);
      if (month < start || month > end) continue;
      const amount = (Number(deal.monthly_fee) || 0) + (Number(deal.monthly_revshare) || 0);
      if (amount <= 0) continue;
      items.push({
        dealId: deal.id,
        projectName: deal.project_name,
        companyName: deal.company_name,
        amount,
        label: "Monthly retainer",
      });
    }
  }

  return items.sort((a, b) => b.amount - a.amount);
}

export function expectedRevenueForMonth(deals: FinanceDeal[], month: string): number {
  return expectedRevenueBreakdownForMonth(deals, month).reduce((sum, item) => sum + item.amount, 0);
}

function actualPaymentLabel(payments: DealPaymentEntry[], month: string): string {
  const monthPayments = payments.filter(
    (payment) => payment.date?.slice(0, 7) === month && (Number(payment.amount) || 0) > 0,
  );
  if (monthPayments.length === 0) return "Payment";
  if (monthPayments.length === 1) {
    const date = monthPayments[0].date;
    if (!date) return "Payment";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(date));
  }
  return `${monthPayments.length} payments`;
}

export function actualRevenueBreakdownForMonth(
  deals: FinanceDeal[],
  month: string,
): RevenueBreakdownItem[] {
  const items: RevenueBreakdownItem[] = [];

  for (const deal of deals) {
    const monthPayments = (deal.payments ?? []).filter(
      (payment) => payment.date?.slice(0, 7) === month,
    );
    const amount = monthPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    if (amount <= 0) continue;
    items.push({
      dealId: deal.id,
      projectName: deal.project_name,
      companyName: deal.company_name,
      amount,
      label: actualPaymentLabel(deal.payments ?? [], month),
    });
  }

  return items.sort((a, b) => b.amount - a.amount);
}

export function actualRevenueForMonth(deals: FinanceDeal[], month: string): number {
  return actualRevenueBreakdownForMonth(deals, month).reduce((sum, item) => sum + item.amount, 0);
}

export function monthlyInsights(deals: FinanceDeal[], month: string) {
  const expected = expectedRevenueForMonth(deals, month);
  const actual = actualRevenueForMonth(deals, month);
  const actualIncomeTax = actual * INCOME_TAX_PCT;
  const availableSalary = actual - actualIncomeTax - SALARY_MONTHLY;
  return { expected, actual, actualIncomeTax, availableSalary, salaryTarget: SALARY_MONTHLY };
}

export function forecastRevenueForMonth(opportunities: Opportunity[], month: string): number {
  let total = 0;
  for (const opp of opportunities) {
    if (opp.stage === "won" || opp.stage === "lost") continue;
    if (!opp.start_date) continue;
    const startMonth = opp.start_date.slice(0, 7);
    const weighted = addVat(
      (Number(opp.expected_value) || 0) * ((Number(opp.probability) || 0) / 100)
    );

    if (opp.type === "retainer") {
      const endMonth = opp.end_date ? opp.end_date.slice(0, 7) : null;
      if (month >= startMonth && (!endMonth || month <= endMonth)) {
        const startDate = new Date(opp.start_date);
        const endDate = opp.end_date ? new Date(opp.end_date) : new Date(startDate.getFullYear(), startDate.getMonth() + 12, 1);
        const months = Math.max(1,
          (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1
        );
        total += (weighted / months);
      }
    } else {
      // Project: 50% on start, 50% on delivery
      const endMonth = opp.end_date ? opp.end_date.slice(0, 7) : null;
      if (!endMonth || endMonth === startMonth) {
        // No delivery date or same month — full amount in start month
        if (month === startMonth) total += weighted;
      } else {
        if (month === startMonth) total += weighted * 0.5;
        if (month === endMonth) total += weighted * 0.5;
      }
    }
  }
  return total;
}

export function buildInsightSeries(
  deals: FinanceDeal[],
  opportunities: Opportunity[],
  startMonth: string,
  count: number,
) {
  const series: { month: string; expected: number; actual: number; forecast: number; netAfterSalary: number }[] = [];
  const [startY, startM] = startMonth.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    const d = new Date(startY, startM - 1 + i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const expected = expectedRevenueForMonth(deals, m);
    const actual = actualRevenueForMonth(deals, m);
    const forecast = forecastRevenueForMonth(opportunities, m);
    series.push({ month: m, expected, actual, forecast, netAfterSalary: expected - SALARY_MONTHLY });
  }
  return series;
}

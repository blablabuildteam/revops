import { toDateInputValue } from "@/lib/format";
import type {
  ToolBillingFrequency,
  ToolCategory,
  ToolCostType,
  ToolStatus,
  ToolSubscription,
  ToolUsageEntry,
  ToolWithUsage,
} from "@/lib/types";

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

export function addMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKeyOf(d);
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

/** Fixed portion attributed to one calendar month. */
export function monthlyFixedCost(
  tool: Pick<ToolSubscription, "our_cost" | "billing_frequency" | "cost_type">,
): number {
  if (tool.cost_type === "usage") return 0;
  const cost = Number(tool.our_cost) || 0;
  if (tool.billing_frequency === "yearly") {
    return Math.round((cost / 12) * 100) / 100;
  }
  return cost;
}

export function usageForMonth(
  tool: Pick<ToolWithUsage, "usage">,
  month: string,
): ToolUsageEntry | undefined {
  return (tool.usage ?? []).find((u) => u.month === month);
}

/** Total cost for a month (fixed allotment + usage when applicable). */
export function monthTotal(
  tool: Pick<
    ToolWithUsage,
    "our_cost" | "billing_frequency" | "cost_type" | "usage"
  >,
  month: string,
): number {
  const fixed = monthlyFixedCost(tool);
  const usage =
    tool.cost_type === "fixed"
      ? 0
      : Number(usageForMonth(tool, month)?.amount) || 0;
  return Math.round((fixed + usage) * 100) / 100;
}

export function isPassThrough(
  tool: Pick<ToolSubscription, "bill_to_company_id" | "pass_through">,
): boolean {
  return Boolean(tool.bill_to_company_id) && tool.pass_through !== false;
}

export function billableAmount(tool: ToolWithUsage, month: string): number {
  if (!isPassThrough(tool)) return 0;
  return monthTotal(tool, month);
}

export function isInvoiced(
  tool: Pick<ToolSubscription, "invoiced_periods">,
  month: string,
): boolean {
  return normalizeInvoicedPeriods(tool.invoiced_periods).includes(month);
}

/** Tool is active during the given YYYY-MM month. */
export function toolActiveInMonth(
  tool: Pick<ToolSubscription, "status" | "start_date" | "end_date">,
  month: string,
): boolean {
  if (tool.status === "ended" || tool.status === "paused") return false;
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = toDateInputValue(new Date(y, m, 0));
  if (tool.start_date && tool.start_date.slice(0, 10) > monthEnd) return false;
  if (tool.end_date && tool.end_date.slice(0, 10) < monthStart) return false;
  return true;
}

export function mapToolUsageRow(row: Record<string, unknown>): ToolUsageEntry {
  return {
    id: String(row.id),
    tool_id: String(row.tool_id),
    month: String(row.month ?? "").slice(0, 7),
    amount: Number(row.amount) || 0,
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function mapToolRow(row: Record<string, unknown>): ToolSubscription {
  return {
    id: String(row.id),
    name: String(row.name),
    vendor: (row.vendor as string | null) ?? null,
    category: (row.category as ToolCategory) ?? "other",
    cost_type: (row.cost_type as ToolCostType) ?? "fixed",
    billing_frequency: (row.billing_frequency as ToolBillingFrequency) ?? "monthly",
    our_cost: Number(row.our_cost) || 0,
    currency: String(row.currency ?? "EUR"),
    status: (row.status as ToolStatus) ?? "active",
    start_date: row.start_date
      ? toDateInputValue(row.start_date as string | Date)
      : null,
    end_date: row.end_date
      ? toDateInputValue(row.end_date as string | Date)
      : null,
    bill_to_company_id: (row.bill_to_company_id as string | null) ?? null,
    bill_to_company_name: (row.bill_to_company_name as string | null) ?? null,
    pass_through: row.pass_through !== false && row.pass_through !== "false",
    notes: (row.notes as string | null) ?? null,
    login_url: (row.login_url as string | null) ?? null,
    invoiced_periods: normalizeInvoicedPeriods(row.invoiced_periods),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

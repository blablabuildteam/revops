export function formatCurrency(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

export function formatRelativeDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 30) return `In ${diffDays}d`;
  if (diffDays < 60) return "In ~1 month";
  return `In ${Math.round(diffDays / 30)} mo`;
}

function toISODateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toMonthInputValue(month?: string | Date | null): string {
  if (!month) return "";
  if (month instanceof Date) {
    const y = month.getUTCFullYear();
    const m = String(month.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  const str = String(month).trim();
  if (/^\d{4}-\d{2}/.test(str)) return str.slice(0, 7);
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return toMonthInputValue(parsed);
  return "";
}

export function toDateInputValue(date?: string | Date | null): string {
  if (!date) return "";
  if (date instanceof Date) return toISODateString(date);
  const str = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return toISODateString(parsed);
  return "";
}

export function normalizeDateParam(date?: string | Date | null): string | null {
  const value = toDateInputValue(date);
  return value || null;
}

export function normalizePaymentSchedule(schedule: unknown): { month: string; percentage: number }[] {
  if (!Array.isArray(schedule)) return [];
  return schedule.map((entry) => ({
    month: toMonthInputValue(entry?.month as string | Date | null | undefined),
    percentage: Number(entry?.percentage) || 0,
  }));
}

export function formatFinanceDealRow(row: Record<string, unknown>) {
  const payments = Array.isArray(row.payments) ? row.payments : [];
  const amountPaid = payments.length > 0
    ? payments.reduce((sum: number, p: { amount?: number }) => sum + (Number(p.amount) || 0), 0)
    : Number(row.amount_paid ?? 0);

  return {
    ...row,
    total_deal_value: Number(row.total_deal_value),
    monthly_fee: Number(row.monthly_fee),
    monthly_revshare: Number(row.monthly_revshare),
    amount_paid: amountPaid,
    start_date: row.start_date ? toDateInputValue(row.start_date as string | Date) : undefined,
    end_date: row.end_date ? toDateInputValue(row.end_date as string | Date) : undefined,
    payment_schedule: normalizePaymentSchedule(row.payment_schedule),
    payments: payments.map((p: { date?: string | Date; amount?: number }) => ({
      date: toDateInputValue(p.date),
      amount: Number(p.amount) || 0,
    })),
  };
}

export function normalizeDealPayments(payments: unknown): { date: string; amount: number }[] {
  if (!Array.isArray(payments)) return [];
  return payments.map((p) => ({
    date: toDateInputValue(p?.date as string | Date | null | undefined),
    amount: Number(p?.amount) || 0,
  }));
}

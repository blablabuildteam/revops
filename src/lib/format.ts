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

export function toDateInputValue(date?: string | null): string {
  if (!date) return "";
  return String(date).slice(0, 10);
}

export function normalizeDateParam(date?: string | null): string | null {
  if (!date) return null;
  const normalized = String(date).slice(0, 10);
  return normalized || null;
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
    start_date: row.start_date ? String(row.start_date).slice(0, 10) : undefined,
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : undefined,
    payment_schedule: row.payment_schedule ?? [],
    payments: payments.map((p: { date?: string; amount?: number }) => ({
      date: p.date ? String(p.date).slice(0, 10) : "",
      amount: Number(p.amount) || 0,
    })),
  };
}

export function normalizeDealPayments(payments: unknown): { date: string; amount: number }[] {
  if (!Array.isArray(payments)) return [];
  return payments.map((p) => ({
    date: p?.date ? String(p.date).slice(0, 10) : "",
    amount: Number(p?.amount) || 0,
  }));
}

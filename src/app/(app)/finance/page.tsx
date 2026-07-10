"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, toDateInputValue } from "@/lib/format";
import { DealActivationWizard } from "@/components/deal-activation-wizard";
import { getFinanceDeals, updateFinanceDeal, getOpportunities } from "@/lib/api";
import {
  DEAL_TYPE_LABELS,
  DealType,
  DealPaymentEntry,
  FinanceDeal,
  Opportunity,
  PaymentScheduleEntry,
  dealContractValue,
  dealOutstanding,
  sumDealPayments,
  monthlyInsights,
  buildInsightSeries,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

interface Summary {
  month: string;
  totalRevenue: number;
  splits: { salaryPot: number; taxReserve: number; companyReserve: number };
  salaryTarget: number;
  withdrawnThisMonth: number;
  canPaySalary: boolean;
  shortfall: number;
  surplus: number;
  potBalance: number;
  settings: { salaryPct: number; taxPct: number; reservePct: number; salaryPerPerson: number; founders: number };
  history: { month: string; revenue: string }[];
  pipeline: { stage: string; expected_value: string; probability: number; weighted_value: string; close_date: string }[];
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })
    .format(new Date(Number(y), Number(m) - 1, 1));
}

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(date?: string) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

const fc = "h-10 bg-neutral-800 border-neutral-700 text-neutral-100 text-sm";

export default function FinancePage() {
  const month = currentMonth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [deals, setDeals] = useState<FinanceDeal[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState<FinanceDeal | null>(null);
  const [editForm, setEditForm] = useState<Partial<FinanceDeal>>({});
  const [savingDeal, setSavingDeal] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [manualDealOpen, setManualDealOpen] = useState(false);
  const [insightsMonth, setInsightsMonth] = useState(currentMonth);

  const load = useCallback(async () => {
    setLoading(true);
    const [sum, dealList, oppList] = await Promise.all([
      fetch(`/api/finance/summary?month=${currentMonth()}`).then((r) => r.json()),
      getFinanceDeals(),
      getOpportunities(),
    ]);
    setSummary(sum);
    setDeals(dealList);
    setOpportunities(oppList);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openDeal(deal: FinanceDeal) {
    setSelectedDeal(deal);
    setSaveError(null);
    const payments = deal.payments?.length
      ? deal.payments
      : deal.amount_paid > 0
        ? [{ date: "", amount: deal.amount_paid }]
        : [];

    setEditForm({
      company_name: deal.company_name,
      project_name: deal.project_name,
      deal_type: deal.deal_type,
      total_deal_value: deal.total_deal_value,
      start_date: toDateInputValue(deal.start_date),
      end_date: toDateInputValue(deal.end_date),
      monthly_fee: deal.monthly_fee,
      monthly_revshare: deal.monthly_revshare,
      amount_paid: deal.amount_paid ?? 0,
      payments,
      payment_schedule: deal.payment_schedule ?? [],
    });
  }

  function updatePayment(index: number, field: keyof DealPaymentEntry, value: string) {
    setEditForm((f) => ({
      ...f,
      payments: (f.payments ?? []).map((entry, i) =>
        i === index
          ? {
              ...entry,
              [field]: field === "amount" ? (parseFloat(value) || 0) : value,
            }
          : entry
      ),
    }));
  }

  function addPayment() {
    setEditForm((f) => ({
      ...f,
      payments: [...(f.payments ?? []), { date: "", amount: 0 }],
    }));
  }

  function removePayment(index: number) {
    setEditForm((f) => ({
      ...f,
      payments: (f.payments ?? []).filter((_, i) => i !== index),
    }));
  }

  function updateSchedule(index: number, field: keyof PaymentScheduleEntry, value: string) {
    setEditForm((f) => ({
      ...f,
      payment_schedule: (f.payment_schedule ?? []).map((entry, i) =>
        i === index
          ? {
              ...entry,
              [field]: field === "percentage" ? Number(value) || 0 : value,
            }
          : entry
      ),
    }));
  }

  function addScheduleRow() {
    setEditForm((f) => ({
      ...f,
      payment_schedule: [...(f.payment_schedule ?? []), { month: "", percentage: 0 }],
    }));
  }

  function removeScheduleRow(index: number) {
    setEditForm((f) => ({
      ...f,
      payment_schedule: (f.payment_schedule ?? []).filter((_, i) => i !== index),
    }));
  }

  async function saveDeal() {
    if (!selectedDeal) return;
    setSavingDeal(true);
    setSaveError(null);
    try {
      const payments = (editForm.payments ?? []).filter((p) => p.amount > 0);
      const updated = await updateFinanceDeal(selectedDeal.id, {
        company_name: editForm.company_name,
        project_name: editForm.project_name,
        deal_type: editForm.deal_type,
        total_deal_value: editForm.total_deal_value,
        monthly_fee: editForm.monthly_fee,
        monthly_revshare: editForm.monthly_revshare,
        payment_schedule: editForm.payment_schedule ?? [],
        payments,
        start_date: editForm.start_date || null,
        end_date: editForm.end_date || null,
      });
      setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setSelectedDeal(null);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save deal");
    } finally {
      setSavingDeal(false);
    }
  }

  const maxHistory = summary?.history.length
    ? Math.max(...summary.history.map((h) => Number(h.revenue)))
    : 1;

  const insights = monthlyInsights(deals, insightsMonth);
  const insightSeries = buildInsightSeries(deals, opportunities, month, 12);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Finance overview</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Finance deals, allocation & salary pot</p>
        </div>
        <Button
          onClick={() => setManualDealOpen(true)}
          className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2"
        >
          <Plus className="w-4 h-4" />
          Add deal
        </Button>
      </div>

      {loading ? (
        <div className="h-64 bg-neutral-900 rounded-lg animate-pulse border border-neutral-800" />
      ) : summary && (
        <>
          {insightSeries.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 border border-neutral-800 rounded-lg p-5 bg-neutral-900/40">
              <h2 className="text-sm font-medium text-neutral-300 mb-1">12-month revenue outlook</h2>
              <p className="text-xs text-neutral-600 mb-4">Expected vs actual revenue and net after €10.9k salary</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={insightSeries} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#737373", fontSize: 11 }}
                    tickFormatter={(v: string) => v.slice(5)}
                    axisLine={{ stroke: "#333" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#737373", fontSize: 11 }}
                    tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <ReferenceLine y={0} stroke="#404040" strokeDasharray="3 3" />
                  <Tooltip
                    contentStyle={{ background: "#171717", border: "1px solid #333", borderRadius: "8px", fontSize: 12 }}
                    labelStyle={{ color: "#a3a3a3" }}
                    labelFormatter={(v: string) => {
                      const d = new Date(v + "-01");
                      return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                    }}
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === "expected" ? "Expected"
                        : name === "actual" ? "Actual"
                        : name === "forecast" ? "Forecasted"
                        : "Net after salary",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="expected"
                    stroke="#e8ff47"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#e8ff47" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#34d399"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#34d399" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    activeDot={{ r: 4, fill: "#a78bfa" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="netAfterSalary"
                    stroke="#f97316"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                    activeDot={{ r: 4, fill: "#f97316" }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-6 mt-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-violet-400 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, #a78bfa 0 4px, transparent 4px 7px)" }} />
                  <span className="text-xs text-neutral-500">Forecasted</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-[#e8ff47] rounded" />
                  <span className="text-xs text-neutral-500">Expected</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-emerald-400 rounded" />
                  <span className="text-xs text-neutral-500">Actual</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-orange-500 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, #f97316 0 3px, transparent 3px 6px)" }} />
                  <span className="text-xs text-neutral-500">Net after salary</span>
                </div>
              </div>
            </div>

            <div className="border border-neutral-800 rounded-lg p-5 space-y-5 bg-neutral-900/40">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-neutral-300">Monthly insights</h2>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setInsightsMonth((m) => addMonths(m, -1))}
                      className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-medium text-neutral-400 w-20 text-center capitalize">
                      {monthLabel(insightsMonth).split(" ")[0].slice(0, 3)} {insightsMonth.split("-")[0]}
                    </span>
                    <button
                      onClick={() => setInsightsMonth((m) => addMonths(m, 1))}
                      className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">Expected revenue</span>
                    <span className="text-sm font-mono font-semibold text-[#e8ff47]">
                      {formatCurrency(insights.expected)}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-600">Based on payment terms &amp; retainer fees</p>
                </div>

                <div className="border-t border-neutral-800" />

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">Actual revenue</span>
                    <span className="text-sm font-mono font-semibold text-emerald-400">
                      {formatCurrency(insights.actual)}
                    </span>
                  </div>
                  {insights.expected > 0 && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500/70 rounded-full transition-all"
                          style={{ width: `${Math.min(100, insights.expected > 0 ? (insights.actual / insights.expected) * 100 : 0)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-neutral-600">
                        {insights.expected > 0 ? Math.round((insights.actual / insights.expected) * 100) : 0}%
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-neutral-600">Recorded payments this month</p>
                </div>

                <div className="border-t border-neutral-800" />

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">Salary coverage</span>
                    <span className={cn(
                      "text-sm font-mono font-semibold",
                      insights.salaryRemaining <= 0 ? "text-emerald-400" : "text-orange-400"
                    )}>
                      {insights.salaryRemaining <= 0
                        ? formatCurrency(Math.abs(insights.salaryRemaining)) + " surplus"
                        : formatCurrency(insights.salaryRemaining) + " short"
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          insights.salaryRemaining <= 0 ? "bg-emerald-500" : "bg-orange-500/70"
                        )}
                        style={{ width: `${Math.min(100, (insights.actual / insights.salaryTarget) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-neutral-600">
                      {Math.min(100, Math.round((insights.actual / insights.salaryTarget) * 100))}%
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-600">{formatCurrency(insights.salaryTarget)} target · {formatCurrency(insights.actual)} received</p>
                </div>
            </div>
            </div>
          )}

          <div className="space-y-4">
              <div className="border border-neutral-800 rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 border-b border-neutral-800">
                  <h2 className="text-sm font-medium text-neutral-300">Finance deals</h2>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    {deals.length} deal{deals.length !== 1 ? "s" : ""} from won opportunities
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-800 bg-neutral-900/60">
                        <th className="text-left px-4 py-3 text-xs text-neutral-500 font-medium">Company</th>
                        <th className="text-left px-4 py-3 text-xs text-neutral-500 font-medium">Project</th>
                        <th className="text-left px-4 py-3 text-xs text-neutral-500 font-medium">Type</th>
                        <th className="text-right px-4 py-3 text-xs text-neutral-500 font-medium">Value / Outstanding</th>
                        <th className="text-left px-4 py-3 text-xs text-neutral-500 font-medium">Period</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {deals.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-neutral-600 text-sm">
                            No finance deals yet. Activate a won opportunity to create one.
                          </td>
                        </tr>
                      ) : (
                        deals.map((deal) => {
                          const contractValue = dealContractValue(deal);
                          const outstanding = dealOutstanding(deal);
                          const paidPct = contractValue > 0
                            ? Math.min(100, Math.round(((deal.amount_paid ?? 0) / contractValue) * 100))
                            : 0;

                          return (
                          <tr
                            key={deal.id}
                            onClick={() => openDeal(deal)}
                            className="hover:bg-neutral-900/50 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3 text-neutral-200">{deal.company_name}</td>
                            <td className="px-4 py-3 text-neutral-400">{deal.project_name}</td>
                            <td className="px-4 py-3">
                              <span className={cn(
                                "text-xs font-mono px-2 py-0.5 rounded",
                                deal.deal_type === "project"
                                  ? "bg-violet-950 text-violet-300"
                                  : "bg-blue-950 text-blue-300"
                              )}>
                                {DEAL_TYPE_LABELS[deal.deal_type]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-3 font-mono text-sm">
                                <span className="text-neutral-300">{formatCurrency(contractValue)}</span>
                                <span className="text-neutral-700">·</span>
                                <span className={outstanding > 0 ? "text-orange-300" : "text-emerald-400"}>
                                  {formatCurrency(outstanding)} left
                                </span>
                              </div>
                              {contractValue > 0 && (
                                <div className="mt-1.5 flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all",
                                        paidPct >= 100 ? "bg-emerald-500" : paidPct > 0 ? "bg-emerald-500/70" : ""
                                      )}
                                      style={{ width: `${paidPct}%` }}
                                    />
                                  </div>
                                  <span className={cn(
                                    "text-[10px] font-mono tabular-nums w-8 text-right",
                                    paidPct >= 100 ? "text-emerald-400" : paidPct > 0 ? "text-neutral-500" : "text-neutral-700"
                                  )}>
                                    {paidPct}%
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-neutral-500 text-xs">
                              {formatDate(deal.start_date)} — {formatDate(deal.end_date)}
                            </td>
                          </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {summary.history.length > 0 && (
                <div className="border border-neutral-800 rounded-lg p-5">
                  <h2 className="text-sm font-medium text-neutral-300 mb-4">Revenue last months</h2>
                  <div className="flex items-end gap-3 h-32">
                    {summary.history.map((h) => {
                      const pct = (Number(h.revenue) / maxHistory) * 100;
                      const isCurrentMonth = h.month === month;
                      return (
                        <div key={h.month} className="flex-1 flex flex-col items-center gap-1.5">
                          <span className="text-xs font-mono text-neutral-600">
                            {formatCurrency(Number(h.revenue), "EUR").replace("€", "").replace(/\s/g, "")}
                          </span>
                          <div className="w-full bg-neutral-800 rounded-t relative" style={{ height: "80px" }}>
                            <div
                              className={`absolute bottom-0 w-full rounded-t transition-all ${isCurrentMonth ? "bg-[#e8ff47]" : "bg-neutral-600"}`}
                              style={{ height: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-mono ${isCurrentMonth ? "text-[#e8ff47]" : "text-neutral-700"}`}>
                            {h.month.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        </>
      )}

      <Dialog open={!!selectedDeal} onOpenChange={(o) => !o && setSelectedDeal(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 !max-w-2xl w-[92vw] p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
              <DialogTitle className="text-neutral-100 text-lg">Finance deal</DialogTitle>
            </DialogHeader>
          </div>

          {selectedDeal && (
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Company</Label>
                  <Input
                    value={editForm.company_name ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, company_name: e.target.value }))}
                    className={fc}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Project</Label>
                  <Input
                    value={editForm.project_name ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, project_name: e.target.value }))}
                    className={fc}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-neutral-400 text-xs">Deal type</Label>
                <div className="flex gap-2">
                  {(["project", "retainer"] as DealType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setEditForm((f) => ({ ...f, deal_type: type }))}
                      className={cn(
                        "px-4 py-2 rounded text-sm font-medium border transition-colors",
                        editForm.deal_type === type
                          ? "bg-[#e8ff47]/10 border-[#e8ff47] text-[#e8ff47]"
                          : "border-neutral-700 text-neutral-500 hover:text-neutral-300"
                      )}
                    >
                      {DEAL_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              {editForm.deal_type === "project" ? (
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Total deal value (€)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editForm.total_deal_value ?? 0}
                    onChange={(e) => setEditForm((f) => ({ ...f, total_deal_value: Number(e.target.value) }))}
                    className={`${fc} font-mono`}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-neutral-400 text-xs">Monthly fee (€)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={editForm.monthly_fee ?? 0}
                      onChange={(e) => setEditForm((f) => ({ ...f, monthly_fee: Number(e.target.value) }))}
                      className={`${fc} font-mono`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-neutral-400 text-xs">Monthly revshare (€)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={editForm.monthly_revshare ?? 0}
                      onChange={(e) => setEditForm((f) => ({ ...f, monthly_revshare: Number(e.target.value) }))}
                      className={`${fc} font-mono`}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Start date</Label>
                  <Input
                    type="date"
                    value={editForm.start_date ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, start_date: e.target.value }))}
                    className={fc}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">End date</Label>
                  <Input
                    type="date"
                    value={editForm.end_date ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, end_date: e.target.value }))}
                    className={fc}
                  />
                </div>
              </div>

              {editForm.deal_type === "project" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-neutral-400 text-xs">Payment terms</Label>
                    <span className={cn(
                      "text-xs font-mono",
                      (editForm.payment_schedule ?? []).reduce((s, e) => s + (Number(e.percentage) || 0), 0) === 100
                        ? "text-emerald-400"
                        : "text-orange-400"
                    )}>
                      Total: {(editForm.payment_schedule ?? []).reduce((s, e) => s + (Number(e.percentage) || 0), 0)}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(editForm.payment_schedule ?? []).map((entry, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          type="month"
                          value={entry.month}
                          onChange={(e) => updateSchedule(index, "month", e.target.value)}
                          className={`${fc} flex-1`}
                        />
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={entry.percentage}
                          onChange={(e) => updateSchedule(index, "percentage", e.target.value)}
                          className={`${fc} w-24 font-mono`}
                        />
                        <span className="text-xs text-neutral-500">%</span>
                        <button
                          type="button"
                          onClick={() => removeScheduleRow(index)}
                          className="p-2 text-neutral-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={addScheduleRow}
                    className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 gap-2 h-8"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add payment term
                  </Button>
                </div>
              )}

              {(() => {
                const payments = editForm.payments ?? [];
                const amountPaid = sumDealPayments(payments);
                const preview = { ...selectedDeal, ...editForm, amount_paid: amountPaid } as FinanceDeal;
                const contractValue = dealContractValue(preview);
                const outstanding = dealOutstanding(preview);
                const paidPct = contractValue > 0
                  ? Math.min(100, Math.round((amountPaid / contractValue) * 100))
                  : 0;

                return (
                  <div className="border border-neutral-800 rounded-lg p-4 space-y-4 bg-neutral-900/40">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-neutral-400 text-xs">Payments received</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={addPayment}
                          className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 gap-2 h-8"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add payment
                        </Button>
                      </div>

                      {(payments.length === 0) ? (
                        <p className="text-xs text-neutral-600">No payments recorded yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {payments.map((payment, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <Input
                                type="date"
                                value={payment.date}
                                onChange={(e) => updatePayment(index, "date", e.target.value)}
                                className={`${fc} flex-1`}
                              />
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={payment.amount ? String(payment.amount) : ""}
                                onChange={(e) => updatePayment(index, "amount", e.target.value)}
                                placeholder="0"
                                className={`${fc} w-32 font-mono`}
                              />
                              <button
                                type="button"
                                onClick={() => removePayment(index)}
                                className="p-2 text-neutral-600 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-neutral-500">Contract value</p>
                        <p className="font-mono text-neutral-200 mt-0.5">{formatCurrency(contractValue)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500">Paid</p>
                        <p className="font-mono text-emerald-400 mt-0.5">{formatCurrency(amountPaid)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500">Outstanding</p>
                        <p className={cn("font-mono mt-0.5", outstanding > 0 ? "text-orange-300" : "text-emerald-400")}>
                          {formatCurrency(outstanding)}
                        </p>
                      </div>
                    </div>

                    {contractValue > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-neutral-500">
                          <span>Payment progress</span>
                          <span className="font-mono">{paidPct}%</span>
                        </div>
                        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {saveError && (
            <p className="text-red-400 text-xs bg-red-950/50 px-6 py-2">{saveError}</p>
          )}

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelectedDeal(null)}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={savingDeal}
              onClick={saveDeal}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium"
            >
              {savingDeal ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DealActivationWizard
        open={manualDealOpen}
        onClose={() => setManualDealOpen(false)}
        onComplete={() => load()}
      />
    </div>
  );
}

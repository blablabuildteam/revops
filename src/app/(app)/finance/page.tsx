"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Wallet,
  PiggyBank,
  Receipt,
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
import { getFinanceDeals, updateFinanceDeal } from "@/lib/api";
import {
  DEAL_TYPE_LABELS,
  DealType,
  DealPaymentEntry,
  FinanceDeal,
  PaymentScheduleEntry,
  dealContractValue,
  dealOutstanding,
  sumDealPayments,
} from "@/lib/types";
import { cn } from "@/lib/utils";

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

function PctBar({ label, pct, value, color }: { label: string; pct: number; value: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-500">{label} ({pct}%)</span>
        <span className={`font-mono font-medium ${color}`}>{formatCurrency(value)}</span>
      </div>
      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color === "text-[#e8ff47]" ? "bg-[#e8ff47]" : color === "text-red-400" ? "bg-red-500" : "bg-neutral-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const fc = "h-10 bg-neutral-800 border-neutral-700 text-neutral-100 text-sm";

export default function FinancePage() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [deals, setDeals] = useState<FinanceDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [withdrawal, setWithdrawal] = useState({ person: "Kevin", amount: "4500" });
  const [selectedDeal, setSelectedDeal] = useState<FinanceDeal | null>(null);
  const [editForm, setEditForm] = useState<Partial<FinanceDeal>>({});
  const [savingDeal, setSavingDeal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [sum, dealList] = await Promise.all([
      fetch(`/api/finance/summary?month=${month}`).then((r) => r.json()),
      getFinanceDeals(),
    ]);
    setSummary(sum);
    setDeals(dealList);
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  async function handleWithdrawal() {
    await fetch("/api/finance/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, amount: parseFloat(withdrawal.amount), person: withdrawal.person }),
    });
    setShowWithdrawal(false);
    load();
  }

  function openDeal(deal: FinanceDeal) {
    setSelectedDeal(deal);
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

  async function saveDeal() {
    if (!selectedDeal) return;
    setSavingDeal(true);
    try {
      const payments = (editForm.payments ?? []).filter((p) => p.amount > 0);
      const updated = await updateFinanceDeal(selectedDeal.id, {
        company_name: editForm.company_name,
        project_name: editForm.project_name,
        deal_type: editForm.deal_type,
        total_deal_value: editForm.total_deal_value,
        monthly_fee: editForm.monthly_fee,
        monthly_revshare: editForm.monthly_revshare,
        payment_schedule: editForm.payment_schedule,
        payments,
        start_date: editForm.start_date ? editForm.start_date : null,
        end_date: editForm.end_date ? editForm.end_date : null,
      });
      setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setSelectedDeal(null);
    } finally {
      setSavingDeal(false);
    }
  }

  const maxHistory = summary?.history.length
    ? Math.max(...summary.history.map((h) => Number(h.revenue)))
    : 1;

  const forecast = summary ? Array.from({ length: 6 }).map((_, i) => {
    const fm = addMonths(month, i + 1);
    const wonMonthly = summary.pipeline
      .filter((p) => p.stage === "won")
      .reduce((s, p) => s + Number(p.expected_value), 0);
    const pipelineAdd = summary.pipeline
      .filter((p) => !["won", "lost"].includes(p.stage) && p.close_date?.slice(0, 7) === fm)
      .reduce((s, p) => s + Number(p.weighted_value), 0);
    const projected = wonMonthly + pipelineAdd;
    return { month: fm, projected };
  }) : [];

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Finance overview</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Finance deals, allocation & salary pot</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth((m) => addMonths(m, -1))}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-neutral-200 w-36 text-center capitalize">
            {monthLabel(month)}
          </span>
          <button onClick={() => setMonth((m) => addMonths(m, 1))}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition-colors"
            disabled={month >= currentMonth()}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-neutral-900 rounded-lg animate-pulse border border-neutral-800" />)}
        </div>
      ) : summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-neutral-600" />
                <p className="text-xs text-neutral-500 uppercase tracking-widest">Revenue</p>
              </div>
              <p className="text-2xl font-mono font-semibold text-[#e8ff47]">
                {formatCurrency(summary.totalRevenue)}
              </p>
              <p className="text-xs text-neutral-600 mt-1">{monthLabel(month)}</p>
            </div>

            <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-3.5 h-3.5 text-neutral-600" />
                <p className="text-xs text-neutral-500 uppercase tracking-widest">Salary pot</p>
              </div>
              <p className="text-2xl font-mono font-semibold text-neutral-100">
                {formatCurrency(summary.splits.salaryPot)}
              </p>
              <p className="text-xs mt-1">
                {summary.canPaySalary
                  ? <span className="text-emerald-500">✓ Salary possible</span>
                  : <span className="text-orange-400">Shortfall {formatCurrency(summary.shortfall)}</span>}
              </p>
            </div>

            <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
              <div className="flex items-center gap-2 mb-1">
                <PiggyBank className="w-3.5 h-3.5 text-neutral-600" />
                <p className="text-xs text-neutral-500 uppercase tracking-widest">Pot balance</p>
              </div>
              <p className="text-2xl font-mono font-semibold text-neutral-100">
                {formatCurrency(summary.potBalance)}
              </p>
              <p className="text-xs text-neutral-600 mt-1">Cumulative balance</p>
            </div>

            <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="w-3.5 h-3.5 text-neutral-600" />
                <p className="text-xs text-neutral-500 uppercase tracking-widest">Tax</p>
              </div>
              <p className="text-2xl font-mono font-semibold text-neutral-100">
                {formatCurrency(summary.splits.taxReserve)}
              </p>
              <p className="text-xs text-neutral-600 mt-1">Reserved</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 space-y-4">
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
                              <div className="flex items-center justify-end gap-3 font-mono">
                                <span className="text-neutral-300">{formatCurrency(contractValue)}</span>
                                <span className="text-neutral-700">·</span>
                                <span className={outstanding > 0 ? "text-orange-300" : "text-emerald-400"}>
                                  {formatCurrency(outstanding)} left
                                </span>
                              </div>
                              {(deal.amount_paid ?? 0) > 0 && (
                                <span className="text-xs text-emerald-400 block mt-0.5">
                                  {formatCurrency(deal.amount_paid)} paid ({paidPct}%)
                                </span>
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

            <div className="space-y-4">
              <div className="border border-neutral-800 rounded-lg p-5 space-y-4">
                <h2 className="text-sm font-medium text-neutral-300">Allocation</h2>
                <PctBar
                  label="Salary pot"
                  pct={summary.settings.salaryPct}
                  value={summary.splits.salaryPot}
                  color="text-[#e8ff47]"
                />
                <PctBar
                  label="Tax"
                  pct={summary.settings.taxPct}
                  value={summary.splits.taxReserve}
                  color="text-red-400"
                />
                <PctBar
                  label="Reserve"
                  pct={summary.settings.reservePct}
                  value={summary.splits.companyReserve}
                  color="text-neutral-400"
                />
              </div>

              <div className="border border-neutral-800 rounded-lg p-5 space-y-3">
                <h2 className="text-sm font-medium text-neutral-300">Salary payout</h2>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Target per person</span>
                    <span className="font-mono text-neutral-300">{formatCurrency(summary.settings.salaryPerPerson)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Totaal ({summary.settings.founders} founders)</span>
                    <span className="font-mono text-neutral-300">{formatCurrency(summary.salaryTarget)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Paid this month</span>
                    <span className="font-mono text-neutral-300">{formatCurrency(summary.withdrawnThisMonth)}</span>
                  </div>
                  <div className="border-t border-neutral-800 pt-1.5 flex justify-between text-xs">
                    <span className="text-neutral-500">Pot balance</span>
                    <span className={`font-mono font-semibold ${summary.potBalance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatCurrency(summary.potBalance)}
                    </span>
                  </div>
                </div>

                {!showWithdrawal ? (
                  <Button
                    onClick={() => setShowWithdrawal(true)}
                    variant="outline"
                    className="w-full text-xs border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 gap-2 h-8"
                  >
                    <Plus className="w-3 h-3" /> Record payout
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={withdrawal.person}
                      onChange={(e) => setWithdrawal((w) => ({ ...w, person: e.target.value }))}
                      placeholder="Name"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-100 outline-none"
                    />
                    <input
                      type="number"
                      value={withdrawal.amount}
                      onChange={(e) => setWithdrawal((w) => ({ ...w, amount: e.target.value }))}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs font-mono text-neutral-100 outline-none"
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleWithdrawal}
                        className="flex-1 h-7 text-xs bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium">
                        Save
                      </Button>
                      <Button onClick={() => setShowWithdrawal(false)} variant="ghost"
                        className="h-7 text-xs text-neutral-600 hover:text-neutral-300">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-neutral-800 rounded-lg p-5 space-y-3">
                <h2 className="text-sm font-medium text-neutral-300">Forecast (6 mo)</h2>
                <p className="text-xs text-neutral-600">Based on active clients + weighted pipeline</p>
                <div className="space-y-2">
                  {forecast.map((f) => (
                    <div key={f.month} className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500 capitalize font-mono">{f.month}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#e8ff47]/50 rounded-full"
                            style={{
                              width: `${Math.min((f.projected / Math.max(...forecast.map((x) => x.projected), 1)) * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono text-neutral-400 w-20 text-right">
                          {formatCurrency(f.projected)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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

              {editForm.deal_type === "project" && (editForm.payment_schedule?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <Label className="text-neutral-400 text-xs">Payment schedule</Label>
                  <div className="space-y-1">
                    {(editForm.payment_schedule as PaymentScheduleEntry[]).map((entry, i) => (
                      <div key={i} className="flex items-center justify-between text-sm text-neutral-400">
                        <span>{entry.month || "—"}</span>
                        <span className="font-mono">{entry.percentage}%</span>
                      </div>
                    ))}
                  </div>
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
    </div>
  );
}

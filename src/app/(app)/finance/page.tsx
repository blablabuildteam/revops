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
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { getCompanies } from "@/lib/api";
import { Company } from "@/lib/types";

interface RevEntry { company_id: string; company_name: string; amount: number; notes?: string }
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
  return new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" })
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

function PctBar({ label, pct, value, color }: { label: string; pct: number; value: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-500">{label} ({pct}%)</span>
        <span className={`font-mono font-medium ${color}`}>{formatCurrency(value)}</span>
      </div>
      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color === "text-[#e8ff47]" ? "bg-[#e8ff47]" : color === "text-red-400" ? "bg-red-500" : "bg-neutral-600"}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function FinancePage() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenues, setRevenues] = useState<RevEntry[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [localAmounts, setLocalAmounts] = useState<Record<string, string>>({});
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [withdrawal, setWithdrawal] = useState({ person: "Kevin", amount: "4500" });

  const load = useCallback(async () => {
    setLoading(true);
    const [sum, rev, comps] = await Promise.all([
      fetch(`/api/finance/summary?month=${month}`).then((r) => r.json()),
      fetch(`/api/finance/revenue?month=${month}`).then((r) => r.json()),
      getCompanies(),
    ]);
    setSummary(sum);
    setRevenues(rev);
    setCompanies(comps);
    // Pre-fill local amounts from saved revenue
    const amounts: Record<string, string> = {};
    for (const r of rev) amounts[r.company_id] = String(r.amount);
    setLocalAmounts(amounts);
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  async function saveRevenue(company_id: string) {
    const amount = parseFloat(localAmounts[company_id] || "0");
    setSavingId(company_id);
    await fetch("/api/finance/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id, month, amount }),
    });
    await load();
    setSavingId(null);
  }

  async function handleWithdrawal() {
    await fetch("/api/finance/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, amount: parseFloat(withdrawal.amount), person: withdrawal.person }),
    });
    setShowWithdrawal(false);
    load();
  }

  const maxHistory = summary?.history.length
    ? Math.max(...summary.history.map((h) => Number(h.revenue)))
    : 1;

  // 6-month forecast
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Financieel overzicht</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Omzet, verdeling & salaris potje</p>
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
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-neutral-600" />
                <p className="text-xs text-neutral-500 uppercase tracking-widest">Omzet</p>
              </div>
              <p className="text-2xl font-mono font-semibold text-[#e8ff47]">
                {formatCurrency(summary.totalRevenue)}
              </p>
              <p className="text-xs text-neutral-600 mt-1">{monthLabel(month)}</p>
            </div>

            <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-3.5 h-3.5 text-neutral-600" />
                <p className="text-xs text-neutral-500 uppercase tracking-widest">Salaris potje</p>
              </div>
              <p className="text-2xl font-mono font-semibold text-neutral-100">
                {formatCurrency(summary.splits.salaryPot)}
              </p>
              <p className="text-xs mt-1">
                {summary.canPaySalary
                  ? <span className="text-emerald-500">✓ Salaris mogelijk</span>
                  : <span className="text-orange-400">Tekort {formatCurrency(summary.shortfall)}</span>}
              </p>
            </div>

            <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
              <div className="flex items-center gap-2 mb-1">
                <PiggyBank className="w-3.5 h-3.5 text-neutral-600" />
                <p className="text-xs text-neutral-500 uppercase tracking-widest">Pot saldo</p>
              </div>
              <p className="text-2xl font-mono font-semibold text-neutral-100">
                {formatCurrency(summary.potBalance)}
              </p>
              <p className="text-xs text-neutral-600 mt-1">Cumulatief opgebouwd</p>
            </div>

            <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="w-3.5 h-3.5 text-neutral-600" />
                <p className="text-xs text-neutral-500 uppercase tracking-widest">Belasting</p>
              </div>
              <p className="text-2xl font-mono font-semibold text-neutral-100">
                {formatCurrency(summary.splits.taxReserve)}
              </p>
              <p className="text-xs text-neutral-600 mt-1">Gereserveerd</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Left: Revenue input per client */}
            <div className="col-span-2 space-y-4">
              <div className="border border-neutral-800 rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 border-b border-neutral-800">
                  <h2 className="text-sm font-medium text-neutral-300">Omzet per klant — {monthLabel(month)}</h2>
                  <p className="text-xs text-neutral-600 mt-0.5">Voer de werkelijke omzet in per klant</p>
                </div>
                <div className="divide-y divide-neutral-800/60">
                  {companies.map((company) => {
                    const saved = revenues.find((r) => r.company_id === company.id);
                    const local = localAmounts[company.id] ?? "";
                    const hasChanged = local !== String(saved?.amount ?? "");

                    return (
                      <div key={company.id} className="flex items-center gap-4 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-neutral-200">{company.name}</p>
                          <p className="text-xs text-neutral-600">{company.industry}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-neutral-700">€</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={local}
                            onChange={(e) => setLocalAmounts((a) => ({ ...a, [company.id]: e.target.value }))}
                            placeholder="0"
                            className="w-28 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm font-mono text-neutral-100 text-right outline-none focus:border-neutral-500"
                          />
                          <button
                            onClick={() => saveRevenue(company.id)}
                            disabled={!hasChanged || savingId === company.id}
                            className={`p-1.5 rounded transition-colors ${hasChanged ? "text-[#e8ff47] hover:bg-[#e8ff47]/10" : "text-neutral-700"}`}
                          >
                            {savingId === company.id
                              ? <span className="text-xs text-neutral-500">...</span>
                              : <Check className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* History bar chart */}
              {summary.history.length > 0 && (
                <div className="border border-neutral-800 rounded-lg p-5">
                  <h2 className="text-sm font-medium text-neutral-300 mb-4">Omzet afgelopen maanden</h2>
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

            {/* Right: Split + pot + salary */}
            <div className="space-y-4">
              {/* Verdeling */}
              <div className="border border-neutral-800 rounded-lg p-5 space-y-4">
                <h2 className="text-sm font-medium text-neutral-300">Verdeling</h2>
                <PctBar
                  label="Salaris potje"
                  pct={summary.settings.salaryPct}
                  value={summary.splits.salaryPot}
                  color="text-[#e8ff47]"
                />
                <PctBar
                  label="Belasting"
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

              {/* Salaris uitbetaling */}
              <div className="border border-neutral-800 rounded-lg p-5 space-y-3">
                <h2 className="text-sm font-medium text-neutral-300">Salaris uitbetaling</h2>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Target per persoon</span>
                    <span className="font-mono text-neutral-300">{formatCurrency(summary.settings.salaryPerPerson)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Totaal ({summary.settings.founders} founders)</span>
                    <span className="font-mono text-neutral-300">{formatCurrency(summary.salaryTarget)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Uitbetaald deze maand</span>
                    <span className="font-mono text-neutral-300">{formatCurrency(summary.withdrawnThisMonth)}</span>
                  </div>
                  <div className="border-t border-neutral-800 pt-1.5 flex justify-between text-xs">
                    <span className="text-neutral-500">Pot saldo</span>
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
                    <Plus className="w-3 h-3" /> Uitbetaling registreren
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={withdrawal.person}
                      onChange={(e) => setWithdrawal((w) => ({ ...w, person: e.target.value }))}
                      placeholder="Naam"
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
                        Opslaan
                      </Button>
                      <Button onClick={() => setShowWithdrawal(false)} variant="ghost"
                        className="h-7 text-xs text-neutral-600 hover:text-neutral-300">
                        Annuleren
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* 6-month forecast */}
              <div className="border border-neutral-800 rounded-lg p-5 space-y-3">
                <h2 className="text-sm font-medium text-neutral-300">Forecast (6 mnd)</h2>
                <p className="text-xs text-neutral-600">Op basis van actieve klanten + gewogen pipeline</p>
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
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Link2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getFinanceDeals } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cacheKeys, invalidateCache, invalidateCachePrefix } from "@/lib/query-cache";
import type { FinanceDeal } from "@/lib/types";
import { cn } from "@/lib/utils";

type Payment = {
  id: number;
  created_at: string;
  amount: number;
  description: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  account_name: string | null;
  company_id: string | null;
  finance_deal_id: string | null;
  matched_confidence: string | null;
};

type Totals = {
  count: number;
  total: number;
  yearTotal?: number;
  unmatchedYearCount?: number;
  unmatchedYearTotal?: number;
  year?: number;
  matchedDeals: number;
  matchedCompanies: number;
  lastSync: string | null;
};

type Status = {
  configured: boolean;
  hasApiKey: boolean;
  environment: string;
  connection: { ok: boolean; accounts?: number; error?: string } | null;
  totals: Totals;
};

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "positive" | "warn";
}) {
  const toneClass = {
    default: "text-neutral-100",
    accent: "text-[#d4e052]",
    positive: "text-emerald-400",
    warn: "text-orange-300",
  }[tone];

  return (
    <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
      <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={cn("text-2xl font-mono font-semibold", toneClass)}>{value}</p>
    </div>
  );
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatSyncTime(value: string | null) {
  if (!value) return "Never synced";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function dealLabel(deal: FinanceDeal) {
  const outstanding = Math.max(
    0,
    (Number(deal.total_deal_value) || 0) - (Number(deal.amount_paid) || 0),
  );
  return `${deal.company_name} · ${deal.project_name} (${formatCurrency(outstanding)} open)`;
}

export function BunqPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [deals, setDeals] = useState<FinanceDeal[]>([]);
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, paymentsRes, dealList] = await Promise.all([
        fetch("/api/bunq/status"),
        fetch(`/api/bunq/payments?revenue=1${unmatchedOnly ? "&unmatched=1" : ""}`),
        getFinanceDeals(),
      ]);
      const statusJson = await statusRes.json();
      const paymentsJson = await paymentsRes.json();
      if (!statusRes.ok) throw new Error(statusJson.error ?? "Status failed");
      if (!paymentsRes.ok) throw new Error(paymentsJson.error ?? "Payments failed");
      setStatus(statusJson);
      setPayments(paymentsJson.payments ?? []);
      setTotals(paymentsJson.totals ?? statusJson.totals ?? null);
      setDeals(dealList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Bunq data");
    } finally {
      setLoading(false);
    }
  }, [unmatchedOnly]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const unmatchedCount = useMemo(
    () => payments.filter((p) => !p.finance_deal_id).length,
    [payments],
  );

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch("/api/bunq/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      setLastResult(
        `Synced ${json.upserted ?? 0} payments · ${formatCurrency(json.totalIncoming ?? 0)} client revenue · ${json.matchedDeals ?? 0} linked to deals · ${json.updatedDeals ?? 0} deal ledgers updated`,
      );
      invalidateCache(cacheKeys.financeDeals());
      invalidateCache(cacheKeys.bunqTotals);
      invalidateCache(cacheKeys.bunqAccounts);
      invalidateCachePrefix("finance-summary:");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function linkPayment(paymentId: number, dealId: string | null) {
    setLinkingId(paymentId);
    setError(null);
    try {
      const res = await fetch(`/api/bunq/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finance_deal_id: dealId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Link failed");
      invalidateCache(cacheKeys.financeDeals());
      invalidateCache(cacheKeys.bunqTotals);
      invalidateCache(cacheKeys.bunqAccounts);
      invalidateCachePrefix("finance-summary:");
      setLastResult(
        dealId
          ? `Linked payment to deal — ledger updated.`
          : `Unlinked payment from deal.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
    } finally {
      setLinkingId(null);
    }
  }

  if (loading && !status) {
    return (
      <div className="h-64 border border-neutral-800 rounded-lg bg-neutral-900/40 animate-pulse" />
    );
  }

  const configured = status?.configured ?? false;

  return (
    <div className="space-y-6">
      {!configured && (
        <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-orange-300 mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-neutral-100">
                Bunq key missing on this environment
              </p>
              <p className="text-neutral-400">
                Locally you may already have <code className="text-neutral-300">BUNQ_API_KEY</code> in{" "}
                <code className="text-neutral-300">.env.local</code> — the live workspace on Vercel needs
                the same variable under <span className="text-neutral-300">Project → Settings → Environment Variables → Production</span>, then redeploy.
              </p>
              <ol className="list-decimal list-inside text-neutral-400 space-y-1">
                <li>bunq app → Developers → API keys → allow all IPs</li>
                <li>
                  Add only: <code className="text-neutral-300">BUNQ_API_KEY=…</code>
                </li>
                <li>Redeploy, open this tab, hit Sync</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {configured && status?.connection && !status.connection.ok && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-4 text-sm text-red-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Connection test failed</p>
            <p className="text-red-300/80 mt-0.5">{status.connection.error}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-neutral-300">Client revenue from bunq</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            From 1 Jan 2026 · Last sync: {formatSyncTime(totals?.lastSync ?? null)}
            {configured && status?.connection?.ok && (
              <span className="inline-flex items-center gap-1 ml-2 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                {status.connection.accounts ?? 0} account
                {(status.connection.accounts ?? 0) === 1 ? "" : "s"}
              </span>
            )}
            {unmatchedCount > 0 && (
              <span className="ml-2 text-orange-300">
                · {unmatchedCount} still to link
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUnmatchedOnly((v) => !v)}
            className={cn(
              "px-3 h-9 rounded-md border text-sm transition-colors",
              unmatchedOnly
                ? "bg-[#d4e052]/10 border-[#d4e052] text-[#d4e052]"
                : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200",
            )}
          >
            Unmatched only
          </button>
          <Button
            onClick={() => void handleSync()}
            disabled={!configured || syncing}
            className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium gap-2 disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 border border-red-500/20 bg-red-500/5 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      {lastResult && !error && (
        <p className="text-sm text-emerald-400/90 border border-emerald-500/20 bg-emerald-500/5 rounded-md px-3 py-2">
          {lastResult}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Client payments" value={String(totals?.count ?? 0)} />
        <Stat
          label="Received"
          value={formatCurrency(totals?.total ?? 0)}
          tone="accent"
        />
        <Stat
          label="Linked to deals"
          value={String(totals?.matchedDeals ?? 0)}
          tone="positive"
        />
        <Stat
          label="Still open to match"
          value={String(Math.max(0, (totals?.count ?? 0) - (totals?.matchedDeals ?? 0)))}
          tone={
            (totals?.count ?? 0) - (totals?.matchedDeals ?? 0) > 0 ? "warn" : "default"
          }
        />
      </div>

      <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-800">
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">From</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-5 py-2.5 font-medium min-w-[220px]">Link to deal</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-neutral-500">
                    {configured
                      ? "No client payments yet — hit Sync now."
                      : "Add BUNQ_API_KEY on Vercel, redeploy, then sync."}
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-neutral-800/80 last:border-0 hover:bg-neutral-900/60"
                  >
                    <td className="px-5 py-3 text-xs text-neutral-400 whitespace-nowrap">
                      {formatWhen(p.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-neutral-200">{p.counterparty_name ?? "—"}</div>
                      {p.counterparty_iban && (
                        <div className="text-[11px] text-neutral-600 font-mono mt-0.5">
                          {p.counterparty_iban}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 max-w-xs truncate" title={p.description}>
                      {p.description || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-emerald-400">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Select
                          value={p.finance_deal_id ?? "__none__"}
                          disabled={linkingId === p.id}
                          onValueChange={(v: string | null) => {
                            const next = !v || v === "__none__" ? null : v;
                            void linkPayment(p.id, next);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs bg-neutral-900 border-neutral-700 min-w-[180px]">
                            <SelectValue placeholder="Pick a deal…" />
                          </SelectTrigger>
                          <SelectContent className="bg-neutral-900 border-neutral-700 max-h-72">
                            <SelectItem value="__none__" className="text-xs text-neutral-500">
                              Unmatched
                            </SelectItem>
                            {deals.map((d) => (
                              <SelectItem key={d.id} value={d.id} className="text-xs">
                                {dealLabel(d)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {p.finance_deal_id && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 shrink-0">
                            <Link2 className="w-3 h-3" />
                            {p.matched_confidence ?? "linked"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-neutral-600 border-l-2 border-neutral-800 pl-3">
        Sync pulls bank inflows, drops internal moves (AutoVAT, payday, own-account sweeps),
        auto-matches by company / invoice number / amount, and writes matched payments onto deal
        ledgers so Overview open amounts and Tax reserve stay accurate. Use the dropdown for anything left unmatched.
      </p>
    </div>
  );
}

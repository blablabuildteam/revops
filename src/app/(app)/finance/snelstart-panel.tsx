"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Link2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Invoice = {
  id: string;
  factuurnummer: string | null;
  factuur_datum: string | null;
  verval_datum: string | null;
  factuur_bedrag: number;
  openstaand_saldo: number;
  betaald_bedrag: number;
  relatie_naam: string | null;
  company_id: string | null;
  finance_deal_id: string | null;
};

type Totals = {
  count: number;
  factuurBedrag: number;
  openstaand: number;
  betaald: number;
  lastSync: string | null;
};

type Status = {
  configured: boolean;
  hasSubscriptionKey: boolean;
  hasClientKey: boolean;
  connection: { ok: boolean; error?: string } | null;
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
    accent: "text-[#b8c47a]",
    positive: "text-stone-300",
    warn: "text-neutral-400",
  }[tone];

  return (
    <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
      <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={cn("text-2xl font-mono font-semibold", toneClass)}>{value}</p>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value + "T12:00:00"));
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

export function SnelstartPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, invoicesRes] = await Promise.all([
        fetch("/api/snelstart/status"),
        fetch(`/api/snelstart/invoices${openOnly ? "?open=1" : ""}`),
      ]);
      const statusJson = await statusRes.json();
      const invoicesJson = await invoicesRes.json();
      if (!statusRes.ok) throw new Error(statusJson.error ?? "Status failed");
      if (!invoicesRes.ok) throw new Error(invoicesJson.error ?? "Invoices failed");
      setStatus(statusJson);
      setInvoices(invoicesJson.invoices ?? []);
      setTotals(invoicesJson.totals ?? statusJson.totals ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SnelStart data");
    } finally {
      setLoading(false);
    }
  }, [openOnly]);

  useEffect(() => {
    // Defer so the effect itself does not synchronously set state.
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/snelstart/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
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
        <div className="border border-neutral-600 bg-neutral-800/60 rounded-lg p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-neutral-100">SnelStart is not fully connected yet</p>
              <p className="text-neutral-400 leading-relaxed">
                You need two keys. The subscription key from the developer portal is
                {status?.hasSubscriptionKey ? " set" : " still missing"}. The{" "}
                <span className="text-neutral-200">maatwerksleutel</span> comes from your
                own SnelStart administration:
              </p>
              <ol className="list-decimal list-inside text-neutral-400 space-y-1">
                <li>Open SnelStart Web → Koppelingen → Maatwerk</li>
                <li>Create / copy the maatwerksleutel for this app</li>
                <li>
                  Add to <code className="text-neutral-300">.env.local</code> and Vercel:
                </li>
              </ol>
              <pre className="text-xs bg-neutral-950 border border-neutral-800 rounded-md p-3 text-neutral-300 overflow-x-auto">
{`SNELSTART_SUBSCRIPTION_KEY=...
SNELSTART_CLIENT_KEY=...   # maatwerksleutel`}
              </pre>
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
          <h2 className="text-sm font-medium text-neutral-300">Sales invoices from SnelStart</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Last sync: {formatSyncTime(totals?.lastSync ?? null)}
            {configured && status?.connection?.ok && (
              <span className="inline-flex items-center gap-1 ml-2 text-stone-300">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpenOnly((v) => !v)}
            className={cn(
              "px-3 h-9 rounded-md border text-sm transition-colors",
              openOnly
                ? "bg-[#b8c47a]/10 border-[#b8c47a] text-[#b8c47a]"
                : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200",
            )}
          >
            Open only
          </button>
          <Button
            onClick={() => void handleSync()}
            disabled={!configured || syncing}
            className="bg-[#b8c47a] hover:bg-[#a3ad68] text-neutral-950 font-medium gap-2 disabled:opacity-50"
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

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Stat label="Invoices" value={String(totals?.count ?? 0)} />
        <Stat
          label="Invoiced"
          value={formatCurrency(totals?.factuurBedrag ?? 0)}
          tone="accent"
        />
        <Stat
          label="Paid"
          value={formatCurrency(totals?.betaald ?? 0)}
          tone="positive"
        />
        <Stat
          label="Outstanding"
          value={formatCurrency(totals?.openstaand ?? 0)}
          tone={(totals?.openstaand ?? 0) > 0 ? "warn" : "default"}
        />
      </div>

      <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-800">
                <th className="px-5 py-2.5 font-medium">Invoice</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium text-right">Paid</th>
                <th className="px-4 py-2.5 font-medium text-right">Open</th>
                <th className="px-5 py-2.5 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-neutral-500">
                    {configured
                      ? "No invoices yet — hit Sync now to pull from SnelStart."
                      : "Configure the keys above, then sync."}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const paidPct =
                    inv.factuur_bedrag > 0
                      ? Math.round((inv.betaald_bedrag / inv.factuur_bedrag) * 100)
                      : 0;
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-neutral-800/80 last:border-0 hover:bg-neutral-900/60"
                    >
                      <td className="px-5 py-3 font-mono text-neutral-200">
                        {inv.factuurnummer ?? inv.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-neutral-300">
                        {inv.relatie_naam ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-400 whitespace-nowrap">
                        {formatDate(inv.factuur_datum)}
                      </td>
                      <td className="px-4 py-3 font-mono text-right text-neutral-200">
                        {formatCurrency(inv.factuur_bedrag)}
                      </td>
                      <td className="px-4 py-3 font-mono text-right text-stone-300">
                        {formatCurrency(inv.betaald_bedrag)}
                        <span className="text-neutral-600 text-[10px] ml-1">{paidPct}%</span>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 font-mono text-right",
                          inv.openstaand_saldo > 0 ? "text-neutral-400" : "text-neutral-500",
                        )}
                      >
                        {formatCurrency(inv.openstaand_saldo)}
                      </td>
                      <td className="px-5 py-3">
                        {inv.finance_deal_id || inv.company_id ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-stone-300">
                            <Link2 className="w-3 h-3" />
                            {inv.finance_deal_id ? "Deal" : "Company"}
                          </span>
                        ) : (
                          <span className="text-[11px] text-neutral-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-neutral-600 border-l-2 border-neutral-800 pl-3">
        Amounts come from SnelStart as booked (incl. VAT). Paid = invoice total − outstanding
        balance. Matching to RevOps companies/deals is by customer name — rename mismatches
        in Companies if a row does not link.
      </p>
    </div>
  );
}

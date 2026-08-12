"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CalendarClock } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { updateFinanceDeal, updateOpportunity } from "@/lib/api";
import {
  DEAL_LOAD_STATUS_LABELS,
  TARGET_HOURLY_RATE,
  buildDealLoadRows,
  type DealLoadRow,
  type DealLoadStatus,
} from "@/lib/deal-capacity";
import { ALLOCATION_WEEKLY_HOURS, TASK_ASSIGNEES } from "@/lib/types";
import type { FinanceDeal, Opportunity, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

function statusTone(status: DealLoadStatus) {
  switch (status) {
    case "ok":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    case "overloaded":
      return "text-red-400 bg-red-500/10 border-red-500/20";
    default:
      return "text-neutral-400 bg-neutral-800 border-neutral-700";
  }
}

function StatusIcon({ status }: { status: DealLoadStatus }) {
  if (status === "ok") return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (status === "missing_weeks" || status === "missing_value") {
    return <CalendarClock className="w-3.5 h-3.5" />;
  }
  return <AlertTriangle className="w-3.5 h-3.5" />;
}

function formatHours(h: number) {
  if (h <= 0) return "—";
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

function formatPct(pct: number) {
  return `${Math.round(pct * 100)}%`;
}

function SummaryCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "accent" | "warn" | "bad";
}) {
  const valueClass = {
    default: "text-neutral-100",
    accent: "text-[#d4e052]",
    warn: "text-orange-300",
    bad: "text-red-400",
  }[tone];

  return (
    <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
      <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={cn("text-2xl font-mono font-semibold", valueClass)}>{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}

function RowLink({ row }: { row: DealLoadRow }) {
  if (row.projectId) {
    return (
      <Link
        href={`/projects/${row.projectId}`}
        className="inline-flex items-center gap-1 text-neutral-200 hover:text-[#d4e052] transition-colors"
      >
        {row.name}
        <ArrowUpRight className="w-3 h-3 opacity-50" />
      </Link>
    );
  }
  if (row.source === "opportunity" && row.opportunityId) {
    return (
      <Link
        href="/opportunities"
        className="inline-flex items-center gap-1 text-neutral-200 hover:text-[#d4e052] transition-colors"
      >
        {row.name}
        <ArrowUpRight className="w-3 h-3 opacity-50" />
      </Link>
    );
  }
  return <span className="text-neutral-200">{row.name}</span>;
}

function WeeksInput({
  row,
  onSaved,
}: {
  row: DealLoadRow;
  onSaved: () => void;
}) {
  const initial =
    row.weeks > 0 ? String(row.weeks) : "";
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const trimmed = value.trim().replace(",", ".");
    const next =
      trimmed === "" ? null : Math.round(Number(trimmed) * 10) / 10;
    if (next !== null && (!Number.isFinite(next) || next <= 0)) {
      setError("Enter weeks > 0");
      setValue(initial);
      return;
    }

    const shown = row.weeks > 0 ? row.weeks : null;
    // Unchanged from what's on screen — don't write (avoids locking date hints on blur).
    if (next === shown) {
      setError(null);
      return;
    }
    // Clearing a date hint: restore display, don't wipe.
    if (next === null && row.weeksFromDates) {
      setValue(initial);
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (row.source === "deal" && row.dealId) {
        await updateFinanceDeal(row.dealId, { delivery_weeks: next });
      } else if (row.source === "opportunity" && row.opportunityId) {
        await updateOpportunity(row.opportunityId, { delivery_weeks: next });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setValue(initial);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0.5}
          step={0.5}
          inputMode="decimal"
          placeholder="—"
          value={value}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="w-16 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-right font-mono text-sm text-neutral-100 tabular-nums focus:border-[#d4e052]/40 focus:outline-none disabled:opacity-50"
        />
        <span className="text-[11px] text-neutral-500">wk</span>
      </div>
      {row.weeksFromDates && (
        <span className="text-[10px] text-neutral-600">from dates · edit to lock</span>
      )}
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}

export function DealLoadPanel({
  deals,
  projects,
  opportunities,
  onRefresh,
}: {
  deals: FinanceDeal[];
  projects: Project[];
  opportunities: Opportunity[];
  onRefresh?: () => void;
}) {
  const rows = useMemo(
    () => buildDealLoadRows({ deals, projects, opportunities }),
    [deals, projects, opportunities],
  );

  const firmWeekly = TASK_ASSIGNEES.length * ALLOCATION_WEEKLY_HOURS;
  const overloaded = rows.filter((r) => r.status === "overloaded").length;
  const needsWeeks = rows.filter((r) => r.status === "missing_weeks").length;
  const totalBudgetHours = rows.reduce((sum, r) => sum + r.budgetHours, 0);
  const peakLoad = rows.reduce((max, r) => Math.max(max, r.teamLoadPct), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Planning rate"
          value={`€${TARGET_HOURLY_RATE}/h`}
          sub="Fee excl. VAT ÷ hours"
          tone="accent"
        />
        <SummaryCard
          label="Hour budget"
          value={formatHours(totalBudgetHours)}
          sub={`${rows.length} jobs · fee ÷ €${TARGET_HOURLY_RATE}`}
        />
        <SummaryCard
          label="Heaviest job"
          value={peakLoad > 0 ? formatPct(peakLoad) : "—"}
          sub={`Of ${firmWeekly}h team week`}
          tone={peakLoad > 1 ? "bad" : peakLoad > 0.7 ? "warn" : "default"}
        />
        <SummaryCard
          label="Needs attention"
          value={String(overloaded + needsWeeks)}
          sub={
            overloaded + needsWeeks > 0
              ? `${overloaded} overloaded · ${needsWeeks} no stretch`
              : "All jobs fit at €175/h"
          }
          tone={overloaded + needsWeeks > 0 ? "warn" : "default"}
        />
      </div>

      <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/40">
        <div className="px-5 py-3.5 border-b border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-300">
            Capacity at €{TARGET_HOURLY_RATE}/h
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Budget hours = project fee excl. VAT ÷ €{TARGET_HOURLY_RATE}. Fill in weekstretch
            yourself — that spreads the budget into h/week. No timesheets.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-800">
                <th className="px-5 py-2.5 font-medium">Job</th>
                <th className="px-4 py-2.5 font-medium">Fee excl. VAT</th>
                <th className="px-4 py-2.5 font-medium">Weekstretch</th>
                <th className="px-4 py-2.5 font-medium text-right">Budget hours</th>
                <th className="px-4 py-2.5 font-medium text-right">h / week</th>
                <th className="px-4 py-2.5 font-medium text-right">Team load</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-neutral-500">
                    Add a fee on deals or opportunities to see capacity.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-neutral-800/80 last:border-0 hover:bg-neutral-900/60"
                  >
                    <td className="px-5 py-3">
                      <div className="min-w-0">
                        <RowLink row={row} />
                        <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                          {row.companyName}
                          {row.source === "opportunity" ? " · pipeline" : ""}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-200 whitespace-nowrap">
                      {formatCurrency(row.valueExVat)}
                    </td>
                    <td className="px-4 py-3">
                      <WeeksInput
                        key={`${row.key}-${row.weeks}-${row.weeksFromDates}`}
                        row={row}
                        onSaved={() => onRefresh?.()}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-neutral-200">
                      {formatHours(row.budgetHours)}
                      {row.budgetHours > 0 && (
                        <span className="block text-[10px] text-neutral-600 font-sans mt-0.5">
                          @ €{TARGET_HOURLY_RATE}/h
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[#d4e052]">
                      {formatHours(row.hoursPerWeekNeeded)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 font-mono text-right",
                        row.teamLoadPct > 1
                          ? "text-red-400"
                          : row.teamLoadPct > 0.7
                            ? "text-orange-300"
                            : "text-neutral-300",
                      )}
                    >
                      {row.weeks > 0 ? formatPct(row.teamLoadPct) : "—"}
                      {row.weeks > 0 && (
                        <span className="block text-[10px] text-neutral-600 font-sans mt-0.5">
                          of {firmWeekly}h/wk
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border",
                          statusTone(row.status),
                        )}
                      >
                        <StatusIcon status={row.status} />
                        {DEAL_LOAD_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-neutral-600 border-l-2 border-neutral-800 pl-3">
        Example: €17.500 excl. VAT ÷ €{TARGET_HOURLY_RATE} = 100h budget. Over 10 weeks → 10h/week.
        Shorter stretch = higher weekly claim against the {TASK_ASSIGNEES.length}-person ×{" "}
        {ALLOCATION_WEEKLY_HOURS}h team. Finishing under budget hours = effective rate above €
        {TARGET_HOURLY_RATE}.
      </p>
    </div>
  );
}

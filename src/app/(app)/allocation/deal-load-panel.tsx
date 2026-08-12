"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CalendarClock } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import {
  DEAL_LOAD_STATUS_LABELS,
  TARGET_HOURLY_RATE,
  buildDealLoadRows,
  type DealLoadRow,
  type DealLoadStatus,
} from "@/lib/deal-capacity";
import { ALLOCATION_WEEKLY_HOURS, TASK_ASSIGNEES } from "@/lib/types";
import type { Allocation, FinanceDeal, Opportunity, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

function statusTone(status: DealLoadStatus) {
  switch (status) {
    case "ok":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    case "tight":
      return "text-orange-300 bg-orange-500/10 border-orange-500/20";
    case "overloaded":
    case "over_planned":
      return "text-red-400 bg-red-500/10 border-red-500/20";
    default:
      return "text-neutral-400 bg-neutral-800 border-neutral-700";
  }
}

function StatusIcon({ status }: { status: DealLoadStatus }) {
  if (status === "ok") return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (status === "missing_dates" || status === "missing_value") {
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

function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return "No dates";
  const fmt = (d: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
      new Date(d + "T12:00:00"),
    );
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  return start ? `From ${fmt(start)}` : `Until ${fmt(end!)}`;
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

export function DealLoadPanel({
  deals,
  projects,
  opportunities,
  allocations,
}: {
  deals: FinanceDeal[];
  projects: Project[];
  opportunities: Opportunity[];
  allocations: Allocation[];
}) {
  const rows = useMemo(
    () => buildDealLoadRows({ deals, projects, opportunities, allocations }),
    [deals, projects, opportunities, allocations],
  );

  const firmWeekly = TASK_ASSIGNEES.length * ALLOCATION_WEEKLY_HOURS;
  const flagged = rows.filter((r) => r.status === "overloaded" || r.status === "tight");
  const overloaded = rows.filter((r) => r.status === "overloaded").length;
  const tight = rows.filter((r) => r.status === "tight").length;
  const totalBudgetHours = rows.reduce((sum, r) => sum + r.budgetHours, 0);
  const peakLoad = rows.reduce((max, r) => Math.max(max, r.teamLoadPct), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Planning rate"
          value={`€${TARGET_HOURLY_RATE}`}
          sub="Fee excl. VAT ÷ hours"
          tone="accent"
        />
        <SummaryCard
          label="Hour budget"
          value={formatHours(totalBudgetHours)}
          sub={`${rows.length} jobs · ${TASK_ASSIGNEES.length}×${ALLOCATION_WEEKLY_HOURS}h/wk team`}
        />
        <SummaryCard
          label="Heaviest job"
          value={peakLoad > 0 ? formatPct(peakLoad) : "—"}
          sub="Of weekly team capacity"
          tone={peakLoad > 1 ? "bad" : peakLoad > 0.7 ? "warn" : "default"}
        />
        <SummaryCard
          label="Won’t fit"
          value={String(overloaded + tight)}
          sub={
            overloaded + tight > 0
              ? `${overloaded} overloaded · ${tight} calendar full`
              : "All jobs fit at €175/h"
          }
          tone={overloaded + tight > 0 ? "warn" : "default"}
        />
      </div>

      <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/40">
        <div className="px-5 py-3.5 border-b border-neutral-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-neutral-300">
              Capacity at €{TARGET_HOURLY_RATE}/h
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              No timesheets — only fee + delivery window. You may work faster (higher effective
              rate) or slower; this is the planning floor.
            </p>
          </div>
          {flagged.length > 0 && (
            <span className="text-xs text-orange-300 shrink-0">
              {flagged.length} need a longer window or less scope
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-800">
                <th className="px-5 py-2.5 font-medium">Job</th>
                <th className="px-4 py-2.5 font-medium">Fee excl. VAT</th>
                <th className="px-4 py-2.5 font-medium">Deliver</th>
                <th className="px-4 py-2.5 font-medium text-right">Budget</th>
                <th className="px-4 py-2.5 font-medium text-right">h / week</th>
                <th className="px-4 py-2.5 font-medium text-right">Team load</th>
                <th className="px-4 py-2.5 font-medium text-right">Room left</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-neutral-500">
                    Add a fee and start/end dates on deals or opportunities to see capacity.
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
                    <td className="px-4 py-3 text-xs text-neutral-400 whitespace-nowrap">
                      <div>{formatDateRange(row.startDate, row.endDate)}</div>
                      {row.weeks > 0 && (
                        <div className="text-neutral-600 mt-0.5">{row.weeks} wk</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-neutral-200">
                      {formatHours(row.budgetHours)}
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
                    <td className="px-4 py-3 font-mono text-right text-neutral-400">
                      {formatHours(row.freeHours)}
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
        Budget = fee excl. VAT ÷ €{TARGET_HOURLY_RATE}. Spread over the delivery weeks → h/week.
        Jobs are stacked on the same calendar against a {TASK_ASSIGNEES.length}-person ×{" "}
        {ALLOCATION_WEEKLY_HOURS}h week. Finishing in fewer hours than budget = effective rate above
        €{TARGET_HOURLY_RATE}; the model only warns when the calendar cannot absorb the budget.
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CalendarClock } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { updateFinanceDeal, updateOpportunity, updateProject } from "@/lib/api";
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
    case "overdue":
      return "text-red-400 bg-red-500/10 border-red-500/20";
    default:
      return "text-neutral-400 bg-neutral-800 border-neutral-700";
  }
}

function StatusIcon({ status }: { status: DealLoadStatus }) {
  if (status === "ok") return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (status === "missing_deadline" || status === "missing_value") {
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

function formatDeadline(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso + "T12:00:00"));
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

function DeadlineInput({
  row,
  onSaved,
}: {
  row: DealLoadRow;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(row.endDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const next = value.trim() || null;
    if (next === (row.endDate ?? null)) {
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (row.source === "deal" && row.dealId) {
        await updateFinanceDeal(row.dealId, { end_date: next });
        if (row.projectId) {
          await updateProject(row.projectId, {
            end_date: next === null ? (null as unknown as string) : next,
          });
        }
      } else if (row.source === "opportunity" && row.opportunityId) {
        await updateOpportunity(row.opportunityId, { end_date: next ?? undefined });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setValue(row.endDate ?? "");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-0.5 min-w-[9.5rem]">
      <input
        type="date"
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-100 focus:border-[#d4e052]/40 focus:outline-none disabled:opacity-50"
      />
      {row.endDate && row.weeksRemaining > 0 && (
        <span className="text-[10px] text-neutral-600">
          {row.weeksRemaining} wk left
        </span>
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
  const [includePipeline, setIncludePipeline] = useState(false);

  const rows = useMemo(
    () => buildDealLoadRows({ deals, projects, opportunities, includePipeline }),
    [deals, projects, opportunities, includePipeline],
  );

  const firmWeekly = TASK_ASSIGNEES.length * ALLOCATION_WEEKLY_HOURS;
  const projectsRows = rows.filter((r) => r.kind === "project" && r.hoursPerWeekNeeded > 0);
  const retainerRows = rows.filter((r) => r.kind === "retainer" && r.hoursPerWeekNeeded > 0);
  const overloaded = rows.filter((r) => r.status === "overloaded").length;
  const needsDeadline = rows.filter((r) => r.status === "missing_deadline").length;
  const projectWeekly = projectsRows.reduce((sum, r) => sum + r.hoursPerWeekNeeded, 0);
  const retainerWeekly = retainerRows.reduce((sum, r) => sum + r.hoursPerWeekNeeded, 0);
  const totalWeekly = projectWeekly + retainerWeekly;
  const totalBudgetHours = rows
    .filter((r) => r.kind === "project")
    .reduce((sum, r) => sum + r.budgetHours, 0);
  const utilization = firmWeekly > 0 ? totalWeekly / firmWeekly : 0;
  const room = firmWeekly - totalWeekly;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-neutral-800 p-0.5 bg-neutral-950/60">
          <button
            type="button"
            onClick={() => setIncludePipeline(false)}
            className={cn(
              "px-3.5 py-1.5 text-sm rounded-md transition-colors",
              !includePipeline
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-500 hover:text-neutral-300",
            )}
          >
            Actual
          </button>
          <button
            type="button"
            onClick={() => setIncludePipeline(true)}
            className={cn(
              "px-3.5 py-1.5 text-sm rounded-md transition-colors",
              includePipeline
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-500 hover:text-neutral-300",
            )}
          >
            Actual + pipeline
          </button>
        </div>
        <p className="text-xs text-neutral-600">
          {includePipeline
            ? "Inclusief open opportunities"
            : "Alleen bevestigde finance deals"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Planning rate"
          value={`€${TARGET_HOURLY_RATE}/h`}
          sub="Fee excl. VAT ÷ hours"
          tone="accent"
        />
        <SummaryCard
          label="Project hour budgets"
          value={formatHours(totalBudgetHours)}
          sub={`${projectsRows.length} active · total fee ÷ €${TARGET_HOURLY_RATE}`}
        />
        <SummaryCard
          label="Concurrent load / week"
          value={formatHours(totalWeekly)}
          sub={`Ruimte ${formatHours(room)} van ${formatHours(firmWeekly)} team`}
          tone={utilization > 1 ? "bad" : utilization > 0.85 ? "warn" : "default"}
        />
        <SummaryCard
          label="Bezettingsgraad"
          value={formatPct(utilization)}
          sub={
            overloaded + needsDeadline > 0
              ? `${overloaded} overloaded · ${needsDeadline} no deadline`
              : `${formatHours(projectWeekly)} proj + ${formatHours(retainerWeekly)} ret`
          }
          tone={utilization > 1 ? "bad" : utilization > 0.85 ? "warn" : "default"}
        />
      </div>

      <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/40">
        <div className="px-5 py-3.5 border-b border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-300">
            Capacity at €{TARGET_HOURLY_RATE}/h
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Projects: fee ÷ €{TARGET_HOURLY_RATE} = hour budget, spread until the deadline.
            Retainers: monthly fee ÷ €{TARGET_HOURLY_RATE} = hours included each month.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-800">
                <th className="px-5 py-2.5 font-medium">Job</th>
                <th className="px-4 py-2.5 font-medium">Fee</th>
                <th className="px-4 py-2.5 font-medium">Deadline</th>
                <th className="px-4 py-2.5 font-medium text-right">Budget</th>
                <th className="px-4 py-2.5 font-medium text-right">Pace</th>
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
                          {row.kind === "retainer" ? " · retainer" : ""}
                          {row.source === "opportunity" ? " · pipeline" : ""}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-200 whitespace-nowrap">
                      {formatCurrency(row.valueExVat)}
                      <span className="block text-[10px] text-neutral-600 font-sans mt-0.5">
                        {row.kind === "retainer" ? "excl. VAT / mo" : "excl. VAT"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.kind === "retainer" ? (
                        <div>
                          <span className="text-xs text-neutral-400">Ongoing</span>
                          <span className="block text-[10px] text-neutral-600 mt-0.5">
                            {formatHours(row.budgetHours)}/mo @ €{TARGET_HOURLY_RATE}
                          </span>
                        </div>
                      ) : (
                        <DeadlineInput
                          key={`${row.key}-${row.endDate}`}
                          row={row}
                          onSaved={() => onRefresh?.()}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-neutral-200">
                      {formatHours(row.budgetHours)}
                      <span className="block text-[10px] text-neutral-600 font-sans mt-0.5">
                        {row.kind === "retainer" ? "per month" : "total"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[#d4e052]">
                      {formatHours(row.hoursPerWeekNeeded)}
                      <span className="block text-[10px] text-neutral-500 font-sans mt-0.5">
                        /wk · {formatHours(row.hoursPerMonthNeeded)}/mo
                      </span>
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
                      {row.hoursPerWeekNeeded > 0 ? formatPct(row.teamLoadPct) : "—"}
                      {row.hoursPerWeekNeeded > 0 && (
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
                      {row.kind === "project" && row.endDate && row.status === "ok" && (
                        <span className="block text-[10px] text-neutral-600 mt-1">
                          Due {formatDeadline(row.endDate)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-neutral-600 border-l-2 border-neutral-800 pl-3">
        Project example: €17.500 excl. VAT ÷ €{TARGET_HOURLY_RATE} = 100h. Deadline in 10 weeks →
        10h/week (≈ 43h/month). Retainer example: €1.750/mo ÷ €{TARGET_HOURLY_RATE} = 10h/month
        included. Finishing under budget = effective rate above €{TARGET_HOURLY_RATE}.
      </p>
    </div>
  );
}

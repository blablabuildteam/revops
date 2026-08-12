"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CalendarClock } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { updateFinanceDeal, updateOpportunity, updateProject } from "@/lib/api";
import {
  DEAL_LOAD_KIND_LABELS,
  DEAL_LOAD_STATUS_LABELS,
  OVERIG_MONTHLY_HOURS,
  TARGET_HOURLY_RATE,
  buildDealLoadRows,
  type DealLoadRow,
  type DealLoadStatus,
} from "@/lib/deal-capacity";
import { ALLOCATION_WEEKLY_HOURS, TASK_ASSIGNEES } from "@/lib/types";
import type { FinanceDeal, Opportunity, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { InfoHint } from "@/components/info-hint";

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
  return Number.isInteger(h) ? `${h}u` : `${h.toFixed(1)}u`;
}

function formatPct(pct: number) {
  return `${Math.round(pct * 100)}%`;
}

function formatDeadline(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("nl-NL", {
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
  info,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "accent" | "warn" | "bad";
  info?: React.ReactNode;
}) {
  const valueClass = {
    default: "text-neutral-100",
    accent: "text-[#d4e052]",
    warn: "text-orange-300",
    bad: "text-red-400",
  }[tone];

  return (
    <div className="border border-neutral-800 rounded-lg px-4 py-3.5 sm:px-5 sm:py-4 bg-neutral-900/40">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-[10px] sm:text-xs text-neutral-500 uppercase tracking-widest">
          {label}
        </p>
        {info && <InfoHint label={label}>{info}</InfoHint>}
      </div>
      <p className={cn("text-xl sm:text-2xl font-mono font-semibold tabular-nums", valueClass)}>
        {value}
      </p>
      {sub && <p className="text-[11px] sm:text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}

function KindBadge({ kind }: { kind: DealLoadRow["kind"] }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 text-[11px] px-2 py-0.5 rounded border",
        kind === "commission"
          ? "text-sky-300 bg-sky-500/10 border-sky-500/20"
          : kind === "overig"
            ? "text-neutral-300 bg-neutral-800 border-neutral-700"
            : kind === "retainer"
              ? "text-stone-300 bg-stone-500/10 border-stone-500/20"
              : "text-neutral-400 bg-neutral-800 border-neutral-700",
      )}
    >
      {DEAL_LOAD_KIND_LABELS[kind]}
    </span>
  );
}

function StatusBadge({ status }: { status: DealLoadStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border",
        statusTone(status),
      )}
    >
      <StatusIcon status={status} />
      {DEAL_LOAD_STATUS_LABELS[status]}
    </span>
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
  compact = false,
}: {
  row: DealLoadRow;
  onSaved: () => void;
  /** Icon-only trigger — used on mobile cards. */
  compact?: boolean;
}) {
  const [value, setValue] = useState(row.endDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(nextRaw: string) {
    const next = nextRaw.trim() || null;
    setValue(next ?? "");
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
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
      setValue(row.endDate ?? "");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      {/* Mobile: calendar icon only */}
      <div className={cn(compact ? "block" : "md:hidden")}>
        <DatePicker
          value={value}
          disabled={saving}
          iconOnly
          placeholder="Deadline"
          onChange={(v) => void commit(v)}
          className="border-neutral-700 bg-neutral-950"
        />
      </div>
      {/* Desktop table: icon + date text */}
      {!compact && (
        <div className="hidden md:block min-w-[9.5rem]">
          <DatePicker
            value={value}
            disabled={saving}
            size="sm"
            placeholder="Deadline"
            onChange={(v) => void commit(v)}
            className="border-neutral-700 bg-neutral-950 font-mono text-neutral-100"
          />
        </div>
      )}
      {row.endDate && row.weeksRemaining > 0 && (
        <span className="text-[10px] text-neutral-600">
          nog {row.weeksRemaining} wk
        </span>
      )}
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}

function MonthlyHoursInput({
  row,
  onSaved,
}: {
  row: DealLoadRow;
  onSaved: () => void;
}) {
  const initial =
    row.fixedMonthlyHours && row.hoursPerMonthNeeded > 0
      ? String(row.hoursPerMonthNeeded)
      : "";
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    if (!row.dealId) return;
    const trimmed = value.trim().replace(",", ".");
    const next =
      trimmed === "" ? null : Math.round(Number(trimmed) * 10) / 10;
    if (next !== null && (!Number.isFinite(next) || next <= 0)) {
      setError("Vul uren > 0 in");
      setValue(initial);
      return;
    }
    const shown = row.fixedMonthlyHours ? row.hoursPerMonthNeeded : null;
    if (next === shown) {
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateFinanceDeal(row.dealId, { monthly_hours: next });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
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
          disabled={saving || !row.dealId}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-16 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-right font-mono text-sm text-neutral-100 tabular-nums focus:border-[#d4e052]/40 focus:outline-none disabled:opacity-50"
        />
        <span className="text-[11px] text-neutral-500">u/mnd</span>
      </div>
      <span className="text-[10px] text-neutral-600">
        {row.fixedMonthlyHours ? "vast · partner / commissie" : "optioneel: vaste u/mnd → commissie"}
      </span>
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}

function FeeOrHoursCell({
  row,
  onRefresh,
}: {
  row: DealLoadRow;
  onRefresh?: () => void;
}) {
  if (row.kind === "overig") {
    return (
      <div>
        <p className="font-mono text-neutral-200">
          {formatHours(row.hoursPerMonthNeeded)}/mnd
        </p>
        <p className="text-[10px] text-neutral-600 mt-0.5">vast buffer · niet bewerkbaar</p>
      </div>
    );
  }

  if (row.kind === "commission") {
    return (
      <MonthlyHoursInput
        key={`${row.key}-${row.hoursPerMonthNeeded}`}
        row={row}
        onSaved={() => onRefresh?.()}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="font-mono text-neutral-200 whitespace-nowrap">
        {formatCurrency(row.valueExVat)}
        <span className="block text-[10px] text-neutral-600 font-sans mt-0.5">
          {row.kind === "retainer" ? "excl. btw / mnd" : "excl. btw"}
        </span>
      </div>
      {row.dealId && (
        <MonthlyHoursInput
          key={`${row.key}-set`}
          row={{ ...row, fixedMonthlyHours: false, hoursPerMonthNeeded: 0 }}
          onSaved={() => onRefresh?.()}
        />
      )}
    </div>
  );
}

function TimingCell({
  row,
  onRefresh,
  compact = false,
}: {
  row: DealLoadRow;
  onRefresh?: () => void;
  compact?: boolean;
}) {
  if (row.kind === "project") {
    return (
      <DeadlineInput
        key={`${row.key}-${row.endDate}`}
        row={row}
        compact={compact}
        onSaved={() => onRefresh?.()}
      />
    );
  }

  return (
    <div>
      <span className="text-xs text-neutral-400">Doorlopend</span>
      {row.kind === "retainer" && (
        <span className="block text-[10px] text-neutral-600 mt-0.5">
          {formatHours(row.budgetHours)}/mnd @ €{TARGET_HOURLY_RATE}
        </span>
      )}
      {row.kind === "commission" && (
        <span className="block text-[10px] text-neutral-600 mt-0.5">
          vaste inzet, geen deadline
        </span>
      )}
      {row.kind === "overig" && (
        <span className="block text-[10px] text-neutral-600 mt-0.5">
          admin, mail, overleg, etc.
        </span>
      )}
    </div>
  );
}

function DealLoadCard({
  row,
  firmWeekly,
  onRefresh,
}: {
  row: DealLoadRow;
  firmWeekly: number;
  onRefresh?: () => void;
}) {
  return (
    <li className="px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm truncate">
            <RowLink row={row} />
          </div>
          <p className="text-[11px] text-neutral-500 truncate mt-0.5">
            {row.companyName}
            {row.source === "opportunity" ? " · pipeline" : ""}
          </p>
        </div>
        <KindBadge kind={row.kind} />
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-md border border-neutral-800/80 bg-neutral-950/40 px-3 py-2.5">
        <div>
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider">Budget</p>
          <p className="font-mono text-sm text-neutral-200 tabular-nums">
            {formatHours(row.budgetHours)}
          </p>
          <p className="text-[10px] text-neutral-600">
            {row.kind === "project" ? "totaal" : "per maand"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider">Tempo</p>
          <p className="font-mono text-sm text-[#d4e052] tabular-nums">
            {formatHours(row.hoursPerWeekNeeded)}
          </p>
          <p className="text-[10px] text-neutral-600">
            /wk · {formatHours(row.hoursPerMonthNeeded)}/mnd
          </p>
        </div>
        <div>
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider">Teamlast</p>
          <p
            className={cn(
              "font-mono text-sm tabular-nums",
              row.teamLoadPct > 1
                ? "text-red-400"
                : row.teamLoadPct > 0.7
                  ? "text-orange-300"
                  : "text-neutral-300",
            )}
          >
            {row.hoursPerWeekNeeded > 0 ? formatPct(row.teamLoadPct) : "—"}
          </p>
          <p className="text-[10px] text-neutral-600">van {firmWeekly}u/wk</p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="space-y-1">
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider">Fee / uren</p>
          <FeeOrHoursCell row={row} onRefresh={onRefresh} />
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider">
            {row.kind === "project" ? "Deadline" : "Looptijd"}
          </p>
          <TimingCell row={row} onRefresh={onRefresh} compact />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} />
        {row.kind === "project" && row.endDate && row.status === "ok" && (
          <span className="text-[10px] text-neutral-600">
            Deadline {formatDeadline(row.endDate)}
          </span>
        )}
      </div>
    </li>
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
  const commissionRows = rows.filter((r) => r.kind === "commission" && r.hoursPerWeekNeeded > 0);
  const overigRows = rows.filter((r) => r.kind === "overig" && r.hoursPerWeekNeeded > 0);
  const overloaded = rows.filter((r) => r.status === "overloaded").length;
  const needsDeadline = rows.filter((r) => r.status === "missing_deadline").length;
  const projectWeekly = projectsRows.reduce((sum, r) => sum + r.hoursPerWeekNeeded, 0);
  const retainerWeekly = retainerRows.reduce((sum, r) => sum + r.hoursPerWeekNeeded, 0);
  const commissionWeekly = commissionRows.reduce((sum, r) => sum + r.hoursPerWeekNeeded, 0);
  const overigWeekly = overigRows.reduce((sum, r) => sum + r.hoursPerWeekNeeded, 0);
  const totalWeekly = projectWeekly + retainerWeekly + commissionWeekly + overigWeekly;
  const totalBudgetHours = rows
    .filter((r) => r.kind === "project")
    .reduce((sum, r) => sum + r.budgetHours, 0);
  const commissionMonthly = commissionRows.reduce((sum, r) => sum + r.hoursPerMonthNeeded, 0);
  const utilization = firmWeekly > 0 ? totalWeekly / firmWeekly : 0;
  const room = firmWeekly - totalWeekly;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-neutral-800 p-0.5 bg-neutral-950/60 sm:inline-flex sm:gap-0">
          <button
            type="button"
            onClick={() => setIncludePipeline(false)}
            className={cn(
              "px-3.5 py-2 sm:py-1.5 text-[13px] sm:text-sm rounded-md transition-colors",
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
              "px-3.5 py-2 sm:py-1.5 text-[13px] sm:text-sm rounded-md transition-colors",
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
            : "Alleen lopende deals"}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard
          label="Tarief (projecten)"
          value={`€${TARGET_HOURLY_RATE}/u`}
          sub="Fee excl. btw ÷ uren"
          tone="accent"
        />
        <SummaryCard
          label="Urenbudget projecten"
          value={formatHours(totalBudgetHours)}
          sub={`${projectsRows.length} projecten · fee ÷ €${TARGET_HOURLY_RATE}`}
          info={
            <>
              <p>
                Som van alle projecturen: fee excl. btw ÷ €{TARGET_HOURLY_RATE}.
                Dat is het urenplafond om op target-tarief te landen.
              </p>
              <p>
                Retainers, commissie (vaste partner-uren) en overig tellen hier
                niet mee — die hebben een maandtempo, geen totaalbudget.
              </p>
            </>
          }
        />
        <SummaryCard
          label="Last / week"
          value={formatHours(totalWeekly)}
          sub={`Ruimte ${formatHours(room)} van ${formatHours(firmWeekly)} team`}
          tone={utilization > 1 ? "bad" : utilization > 0.85 ? "warn" : "default"}
        />
        <SummaryCard
          label="Bezettingsgraad"
          value={formatPct(utilization)}
          sub={
            overloaded + needsDeadline > 0
              ? `${overloaded} te zwaar · ${needsDeadline} zonder deadline`
              : `${formatHours(commissionMonthly)}/mnd commissie · ${formatHours(OVERIG_MONTHLY_HOURS)}/mnd overig`
          }
          tone={utilization > 1 ? "bad" : utilization > 0.85 ? "warn" : "default"}
          info={
            <>
              <p>
                Geplande last deze week ÷ teamcapaciteit ({TASK_ASSIGNEES.length}×
                {ALLOCATION_WEEKLY_HOURS}u = {firmWeekly}u/wk).
              </p>
              <p>
                Onder 85% is comfortabel, 85–100% is krap, boven 100% betekent
                dat we meer uren nodig hebben dan het team in één week heeft.
              </p>
              <p>
                Inclusief projecttempo tot de deadline, retainers, commissie en
                overig ({OVERIG_MONTHLY_HOURS}u/mnd).
              </p>
            </>
          }
        />
      </div>

      <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/40">
        <div className="px-4 sm:px-5 py-3.5 border-b border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-300">Klussen</h2>
          <p className="text-[11px] sm:text-xs text-neutral-500 mt-0.5">
            Project: fee ÷ €{TARGET_HOURLY_RATE} tot de deadline. Retainer: maandfee ÷ €
            {TARGET_HOURLY_RATE}. Commissie: vaste partner-uren. Overig: {OVERIG_MONTHLY_HOURS}
            u/mnd admin & randzaken.
          </p>
        </div>

        <ul className="divide-y divide-neutral-800/80 md:hidden">
          {rows.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-neutral-500">
              Zet een fee of vaste maanduren op deals om capacity te zien.
            </li>
          ) : (
            rows.map((row) => (
              <DealLoadCard
                key={row.key}
                row={row}
                firmWeekly={firmWeekly}
                onRefresh={onRefresh}
              />
            ))
          )}
        </ul>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-800">
                <th className="px-5 py-2.5 font-medium">Klus</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Fee / uren</th>
                <th className="px-4 py-2.5 font-medium">Deadline</th>
                <th className="px-4 py-2.5 font-medium text-right">Budget</th>
                <th className="px-4 py-2.5 font-medium text-right">Tempo</th>
                <th className="px-4 py-2.5 font-medium text-right">Teamlast</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-neutral-500">
                    Zet een fee of vaste maanduren op deals om capacity te zien.
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
                    <td className="px-4 py-3">
                      <KindBadge kind={row.kind} />
                    </td>
                    <td className="px-4 py-3">
                      <FeeOrHoursCell row={row} onRefresh={onRefresh} />
                    </td>
                    <td className="px-4 py-3">
                      <TimingCell row={row} onRefresh={onRefresh} />
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-neutral-200">
                      {formatHours(row.budgetHours)}
                      <span className="block text-[10px] text-neutral-600 font-sans mt-0.5">
                        {row.kind === "project" ? "totaal" : "per maand"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-[#d4e052]">
                      {formatHours(row.hoursPerWeekNeeded)}
                      <span className="block text-[10px] text-neutral-500 font-sans mt-0.5">
                        /wk · {formatHours(row.hoursPerMonthNeeded)}/mnd
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
                          van {firmWeekly}u/wk
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status} />
                      {row.kind === "project" && row.endDate && row.status === "ok" && (
                        <span className="block text-[10px] text-neutral-600 mt-1">
                          Deadline {formatDeadline(row.endDate)}
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
        Project: fee ÷ €{TARGET_HOURLY_RATE} tot de deadline. Retainer: maandfee ÷ €
        {TARGET_HOURLY_RATE}. Commissie (Escort, Comfortzone, Heatnest, …): vaste uren/maand.
        Overig: vaste {OVERIG_MONTHLY_HOURS}u/mnd voor admin & randzaken.
      </p>
    </div>
  );
}

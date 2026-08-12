"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TARGET_HOURLY_RATE,
  buildDealLoadRows,
  buildMonthlyCapacity,
  buildWeeklyCapacity,
  type MonthlyCapacityColumn,
  type WeeklyCapacityColumn,
} from "@/lib/deal-capacity";
import { ALLOCATION_WEEKLY_HOURS, TASK_ASSIGNEES } from "@/lib/types";
import type { FinanceDeal, Opportunity, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const VISIBLE_WEEKS = 8;
const VISIBLE_MONTHS = 6;

function formatHours(h: number) {
  const rounded = Math.round(h * 10) / 10;
  if (Math.abs(rounded) < 0.05) return "0u";
  const sign = rounded < 0 ? "−" : "";
  const abs = Math.abs(rounded);
  return `${sign}${Number.isInteger(abs) ? abs : abs.toFixed(1)}u`;
}

function formatPct(pct: number) {
  return `${Math.round(pct * 100)}%`;
}

function formatWeekLabel(d: Date) {
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  return `${fmt(d)} – ${fmt(end)}`;
}

function loadTone(loadPct: number) {
  if (loadPct > 1) return "bad";
  if (loadPct > 0.85) return "warn";
  return "ok";
}

function toneText(tone: ReturnType<typeof loadTone>) {
  return {
    ok: "text-emerald-400",
    warn: "text-orange-300",
    bad: "text-red-400",
  }[tone];
}

function toneBar(tone: ReturnType<typeof loadTone>) {
  return {
    ok: "bg-emerald-500/60",
    warn: "bg-orange-400/70",
    bad: "bg-red-500/70",
  }[tone];
}

function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "ok" | "warn" | "bad";
}) {
  const valueClass = {
    default: "text-neutral-100",
    accent: "text-[#d4e052]",
    ok: "text-emerald-400",
    warn: "text-orange-300",
    bad: "text-red-400",
  }[tone];

  return (
    <div className="space-y-1">
      <p className="text-[10px] sm:text-xs text-neutral-500 uppercase tracking-widest">
        {label}
      </p>
      <p className={cn("text-xl sm:text-2xl font-mono font-semibold tabular-nums", valueClass)}>
        {value}
      </p>
      {hint && <p className="text-[11px] sm:text-xs text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

function PeriodColumn({
  title,
  subtitle,
  hours,
  firmHours,
  loadPct,
  jobs,
}: {
  title: string;
  subtitle?: string;
  hours: number;
  firmHours: number;
  loadPct: number;
  jobs: { key: string; name: string; hours: number }[];
}) {
  const tone = loadTone(loadPct);
  const room = firmHours - hours;
  const fill = Math.min(100, Math.round(loadPct * 100));

  return (
    <div className="w-[76vw] max-w-[17rem] shrink-0 sm:w-auto sm:max-w-none sm:flex-1 sm:min-w-[9.5rem] rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-4 min-h-[240px] flex flex-col">
      <p className="text-xs text-neutral-500 mb-3 leading-snug">{title}</p>
      {subtitle && <p className="text-[10px] text-neutral-600 -mt-2 mb-3">{subtitle}</p>}

      <p className={cn("font-mono text-2xl font-semibold", toneText(tone))}>{formatHours(hours)}</p>
      <p className="text-xs text-neutral-500 mt-1">
        Bezetting <span className={cn("font-mono", toneText(tone))}>{formatPct(loadPct)}</span>
      </p>
      <p
        className={cn(
          "text-xs font-mono mt-0.5 mb-3",
          room >= 0 ? "text-neutral-500" : "text-red-400",
        )}
      >
        Ruimte {formatHours(room)}
      </p>

      <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden mb-3">
        <div
          className={cn("h-full rounded-full", toneBar(tone))}
          style={{ width: `${fill}%` }}
        />
      </div>

      <ul className="space-y-2 flex-1">
        {jobs.length === 0 ? (
          <li className="text-[11px] text-neutral-700">Niets gepland</li>
        ) : (
          jobs.slice(0, 5).map((job) => (
            <li key={job.key} className="flex justify-between gap-2 text-[11px]">
              <span className="text-neutral-400 truncate">{job.name}</span>
              <span className="font-mono text-neutral-600 shrink-0">{formatHours(job.hours)}</span>
            </li>
          ))
        )}
        {jobs.length > 5 && (
          <li className="text-[11px] text-neutral-700">+{jobs.length - 5} meer</li>
        )}
      </ul>
    </div>
  );
}

export function CapacityBezetting({
  deals,
  projects,
  opportunities,
}: {
  deals: FinanceDeal[];
  projects: Project[];
  opportunities: Opportunity[];
}) {
  const [scope, setScope] = useState<"actual" | "pipeline">("actual");
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const includePipeline = scope === "pipeline";

  const rows = useMemo(
    () =>
      buildDealLoadRows({
        deals,
        projects,
        opportunities,
        includePipeline,
      }),
    [deals, projects, opportunities, includePipeline],
  );

  const actualOnly = useMemo(
    () =>
      buildDealLoadRows({
        deals,
        projects,
        opportunities,
        includePipeline: false,
      }),
    [deals, projects, opportunities],
  );

  const weeks = useMemo(
    () => buildWeeklyCapacity({ rows, weekCount: VISIBLE_WEEKS, weekOffset }),
    [rows, weekOffset],
  );

  const months = useMemo(
    () => buildMonthlyCapacity({ rows, monthCount: VISIBLE_MONTHS, monthOffset }),
    [rows, monthOffset],
  );

  const firmWeekly = TASK_ASSIGNEES.length * ALLOCATION_WEEKLY_HOURS;
  const planned = (period === "week" ? weeks[0]?.totalHours : months[0]?.totalHours) ?? 0;
  const capacity =
    period === "week"
      ? (weeks[0]?.firmWeeklyHours ?? firmWeekly)
      : (months[0]?.firmHours ?? firmWeekly);
  const room = capacity - planned;
  const loadPct = capacity > 0 ? planned / capacity : 0;
  const tone = loadTone(loadPct);

  const pipelineDelta = useMemo(() => {
    const withPipe = buildWeeklyCapacity({
      rows: buildDealLoadRows({
        deals,
        projects,
        opportunities,
        includePipeline: true,
      }),
      weekCount: 1,
      weekOffset: 0,
    })[0];
    const actual = buildWeeklyCapacity({
      rows: actualOnly,
      weekCount: 1,
      weekOffset: 0,
    })[0];
    return (withPipe?.totalHours ?? 0) - (actual?.totalHours ?? 0);
  }, [deals, projects, opportunities, actualOnly]);

  const peak =
    period === "week"
      ? weeks.reduce(
          (best, c) => (c.loadPct > best.loadPct ? c : best),
          weeks[0] ?? ({ loadPct: 0, totalHours: 0 } as WeeklyCapacityColumn),
        )
      : months.reduce(
          (best, c) => (c.loadPct > best.loadPct ? c : best),
          months[0] ?? ({ loadPct: 0, totalHours: 0 } as MonthlyCapacityColumn),
        );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-neutral-800 p-0.5 bg-neutral-900/40 sm:inline-flex sm:gap-0">
          {(
            [
              { id: "actual" as const, label: "Actual" },
              { id: "pipeline" as const, label: "Actual + pipeline" },
            ] as const
          ).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setScope(entry.id)}
              className={cn(
                "px-3 py-2 sm:py-1.5 text-[13px] sm:text-sm rounded-md transition-colors",
                scope === entry.id
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-neutral-800 p-0.5 bg-neutral-900/40 sm:inline-flex sm:gap-0">
          {(
            [
              { id: "week" as const, label: "Week" },
              { id: "month" as const, label: "Maand" },
            ] as const
          ).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setPeriod(entry.id)}
              className={cn(
                "px-3 py-2 sm:py-1.5 text-[13px] sm:text-sm rounded-md transition-colors",
                period === entry.id
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="border border-neutral-800 rounded-lg px-4 py-3.5 sm:px-5 sm:py-4 bg-neutral-900/40">
          <Metric
            label={period === "week" ? "Deze week gepland" : "Deze maand gepland"}
            value={formatHours(planned)}
            hint={
              scope === "actual"
                ? `${rows.length} regels · incl. overig`
                : `incl. pipeline (+${formatHours(pipelineDelta)}/wk t.o.v. actual)`
            }
          />
        </div>
        <div className="border border-neutral-800 rounded-lg px-4 py-3.5 sm:px-5 sm:py-4 bg-neutral-900/40">
          <Metric
            label="Teamcapaciteit"
            value={formatHours(capacity)}
            hint={`${TASK_ASSIGNEES.length}×${ALLOCATION_WEEKLY_HOURS}u/wk`}
          />
        </div>
        <div className="border border-neutral-800 rounded-lg px-4 py-3.5 sm:px-5 sm:py-4 bg-neutral-900/40">
          <Metric
            label="Ruimte"
            value={formatHours(room)}
            hint={room >= 0 ? "Nog vrij op €175-tempo" : "Tekort t.o.v. team"}
            tone={room < 0 ? "bad" : room < capacity * 0.15 ? "warn" : "ok"}
          />
        </div>
        <div className="border border-neutral-800 rounded-lg px-4 py-3.5 sm:px-5 sm:py-4 bg-neutral-900/40">
          <Metric
            label="Bezettingsgraad"
            value={formatPct(loadPct)}
            hint={`Drukste in beeld: ${formatPct(peak.loadPct)}`}
            tone={tone === "ok" ? "ok" : tone === "warn" ? "warn" : "bad"}
          />
        </div>
      </section>

      <section className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] sm:text-sm text-neutral-400">
            {period === "week" ? "Per week" : "Per maand"} · last @ €{TARGET_HOURLY_RATE}/u
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              aria-label={period === "week" ? "Vorige weken" : "Vorige maanden"}
              onClick={() =>
                period === "week"
                  ? setWeekOffset((p) => p - VISIBLE_WEEKS)
                  : setMonthOffset((p) => p - VISIBLE_MONTHS)
              }
              className="h-9 w-9 p-0 text-neutral-500 hover:text-neutral-200"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setWeekOffset(0);
                setMonthOffset(0);
              }}
              className="h-9 px-3 text-xs text-neutral-500 hover:text-neutral-200"
            >
              Nu
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={period === "week" ? "Volgende weken" : "Volgende maanden"}
              onClick={() =>
                period === "week"
                  ? setWeekOffset((p) => p + VISIBLE_WEEKS)
                  : setMonthOffset((p) => p + VISIBLE_MONTHS)
              }
              className="h-9 w-9 p-0 text-neutral-500 hover:text-neutral-200"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="snap-rail flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {period === "week"
            ? weeks.map((col) => (
                <PeriodColumn
                  key={col.weekKey}
                  title={formatWeekLabel(col.weekStart)}
                  hours={col.totalHours}
                  firmHours={col.firmWeeklyHours}
                  loadPct={col.loadPct}
                  jobs={col.jobs}
                />
              ))
            : months.map((col) => (
                <PeriodColumn
                  key={col.monthKey}
                  title={col.label}
                  subtitle={`${col.weekCount} weken`}
                  hours={col.totalHours}
                  firmHours={col.firmHours}
                  loadPct={col.loadPct}
                  jobs={col.jobs}
                />
              ))}
        </div>

        <p className="text-[11px] text-neutral-600 leading-relaxed pt-1 sm:pt-2">
          <span className="sm:hidden">Swipe voor meer {period === "week" ? "weken" : "maanden"} · </span>
          Groen &lt; 85% · oranje krap · rood boven teamcapaciteit. Ruimte = capaciteit − geplande
          uren.
        </p>
      </section>
    </div>
  );
}

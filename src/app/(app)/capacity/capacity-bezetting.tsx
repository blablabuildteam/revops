"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TARGET_HOURLY_RATE,
  buildDealLoadRows,
  buildMonthlyCapacity,
  buildWeeklyCapacity,
  type DealLoadRow,
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
  if (Math.abs(rounded) < 0.05) return "0h";
  const sign = rounded < 0 ? "−" : "";
  const abs = Math.abs(rounded);
  return `${sign}${Number.isInteger(abs) ? abs : abs.toFixed(1)}h`;
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
      <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{label}</p>
      <p className={cn("text-3xl font-mono font-medium tracking-tight", valueClass)}>{value}</p>
      {hint && <p className="text-xs text-neutral-600 leading-relaxed">{hint}</p>}
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
    <div className="rounded-xl border border-neutral-800/90 bg-neutral-950/50 px-4 py-4 min-h-[260px] flex flex-col">
      <p className="text-xs text-neutral-500 mb-3 leading-snug">{title}</p>
      {subtitle && <p className="text-[10px] text-neutral-600 -mt-2 mb-3">{subtitle}</p>}

      <p className={cn("font-mono text-2xl font-medium", toneText(tone))}>{formatHours(hours)}</p>
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

      <div className="h-1 rounded-full bg-neutral-800/80 overflow-hidden mb-4">
        <div
          className={cn("h-full rounded-full", toneBar(tone))}
          style={{ width: `${fill}%` }}
        />
      </div>

      <ul className="space-y-2 flex-1">
        {jobs.length === 0 ? (
          <li className="text-[11px] text-neutral-700">Geen last</li>
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
  const near = period === "week" ? weeks[0] : months[0];
  const planned = near?.totalHours ?? 0;
  const capacity = near?.firmHours ?? near?.firmWeeklyHours ?? firmWeekly;
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

  const peak = period === "week"
    ? weeks.reduce(
        (best, c) => (c.loadPct > best.loadPct ? c : best),
        weeks[0] ?? ({ loadPct: 0, totalHours: 0 } as WeeklyCapacityColumn),
      )
    : months.reduce(
        (best, c) => (c.loadPct > best.loadPct ? c : best),
        months[0] ?? ({ loadPct: 0, totalHours: 0 } as MonthlyCapacityColumn),
      );

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <header className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-600">
              Capacity · €{TARGET_HOURLY_RATE}/h
            </p>
            <h1 className="text-3xl font-semibold text-neutral-100 tracking-tight">
              Bezetting
            </h1>
            <p className="text-sm text-neutral-500 max-w-lg leading-relaxed">
              Uren gelijkmatig verdeeld tot de deadline. Standaard alleen lopende deals —
              pipeline is optioneel.
            </p>
          </div>
          <Link
            href="/allocation"
            className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-[#d4e052] transition-colors"
          >
            Klussen & deadlines
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-neutral-800 p-0.5 bg-neutral-950/60">
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
                  "px-3.5 py-1.5 text-sm rounded-md transition-colors",
                  scope === entry.id
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-300",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-neutral-800 p-0.5 bg-neutral-950/60">
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
                  "px-3.5 py-1.5 text-sm rounded-md transition-colors",
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
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-8 py-2">
        <Metric
          label={period === "week" ? "Deze week gepland" : "Deze maand gepland"}
          value={formatHours(planned)}
          hint={
            scope === "actual"
              ? `${rows.length} lopende klussen`
              : `incl. pipeline (+${formatHours(pipelineDelta)}/wk t.o.v. actual)`
          }
        />
        <Metric
          label="Teamcapaciteit"
          value={formatHours(capacity)}
          hint={`${TASK_ASSIGNEES.length}×${ALLOCATION_WEEKLY_HOURS}h/wk`}
        />
        <Metric
          label="Ruimte"
          value={formatHours(room)}
          hint={room >= 0 ? "Nog vrij op €175-tempo" : "Tekort t.o.v. teamweek"}
          tone={room < 0 ? "bad" : room < capacity * 0.15 ? "warn" : "ok"}
        />
        <Metric
          label="Bezettingsgraad"
          value={formatPct(loadPct)}
          hint={`Drukste in beeld: ${formatPct(peak.loadPct)}`}
          tone={tone === "ok" ? "ok" : tone === "warn" ? "warn" : "bad"}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-neutral-400">
            {period === "week" ? "Weken" : "Maanden"} · geschatte last
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                period === "week"
                  ? setWeekOffset((p) => p - VISIBLE_WEEKS)
                  : setMonthOffset((p) => p - VISIBLE_MONTHS)
              }
              className="text-neutral-500 hover:text-neutral-200"
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
              className="text-xs text-neutral-500 hover:text-neutral-200 px-3"
            >
              Nu
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                period === "week"
                  ? setWeekOffset((p) => p + VISIBLE_WEEKS)
                  : setMonthOffset((p) => p + VISIBLE_MONTHS)
              }
              className="text-neutral-500 hover:text-neutral-200"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto -mx-1 px-1">
          {period === "week" ? (
            <div
              className="grid gap-3 min-w-[640px]"
              style={{
                gridTemplateColumns: `repeat(${VISIBLE_WEEKS}, minmax(9rem, 1fr))`,
              }}
            >
              {weeks.map((col) => (
                <PeriodColumn
                  key={col.weekKey}
                  title={formatWeekLabel(col.weekStart)}
                  hours={col.totalHours}
                  firmHours={col.firmWeeklyHours}
                  loadPct={col.loadPct}
                  jobs={col.jobs}
                />
              ))}
            </div>
          ) : (
            <div
              className="grid gap-3 min-w-[640px]"
              style={{
                gridTemplateColumns: `repeat(${VISIBLE_MONTHS}, minmax(10rem, 1fr))`,
              }}
            >
              {months.map((col) => (
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
          )}
        </div>

        <p className="text-[11px] text-neutral-600 leading-relaxed pt-2">
          Groen &lt; 85% · oranje krap · rood over teamcapaciteit. Ruimte = capaciteit − geplande
          uren op €{TARGET_HOURLY_RATE}/h.
        </p>
      </section>
    </div>
  );
}

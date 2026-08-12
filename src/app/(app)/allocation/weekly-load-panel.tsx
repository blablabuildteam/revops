"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TARGET_HOURLY_RATE,
  buildMonthlyCapacity,
  buildWeeklyCapacity,
  type DealLoadRow,
  type MonthlyCapacityColumn,
  type WeeklyCapacityColumn,
} from "@/lib/deal-capacity";
import { ALLOCATION_WEEKLY_HOURS, TASK_ASSIGNEES } from "@/lib/types";
import { cn } from "@/lib/utils";

const VISIBLE_WEEKS = 12;
const VISIBLE_MONTHS = 6;

function formatHours(h: number) {
  if (h <= 0) return "0h";
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

function formatPct(pct: number) {
  return `${Math.round(pct * 100)}%`;
}

function formatWeekLabel(d: Date) {
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(d)} – ${fmt(end)}`;
}

function loadTone(loadPct: number) {
  if (loadPct > 1) return "bad";
  if (loadPct > 0.85) return "warn";
  if (loadPct > 0.55) return "mid";
  return "ok";
}

function barColor(tone: ReturnType<typeof loadTone>) {
  return {
    ok: "bg-emerald-500/70",
    mid: "bg-[#d4e052]/70",
    warn: "bg-orange-400/80",
    bad: "bg-red-500/80",
  }[tone];
}

function textTone(tone: ReturnType<typeof loadTone>) {
  return {
    ok: "text-emerald-400",
    mid: "text-[#d4e052]",
    warn: "text-orange-300",
    bad: "text-red-400",
  }[tone];
}

function PeriodCard({
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
  jobs: { key: string; name: string; hours: number; kind: string; source: string }[];
}) {
  const tone = loadTone(loadPct);
  const fill = Math.min(100, Math.round(loadPct * 100));

  return (
    <div className="bg-neutral-950/80 px-3 py-3.5 flex flex-col min-h-[240px] border border-neutral-800/80 rounded-lg">
      <p className="text-[11px] text-neutral-500 leading-snug mb-2">{title}</p>
      {subtitle && <p className="text-[10px] text-neutral-600 mb-2">{subtitle}</p>}

      <p className={cn("font-mono text-xl font-semibold", textTone(tone))}>
        {formatHours(hours)}
      </p>
      <p className="text-xs text-neutral-400 mt-1">
        Bezetting{" "}
        <span className={cn("font-mono font-medium", textTone(tone))}>
          {formatPct(loadPct)}
        </span>
      </p>
      <p className="text-[10px] text-neutral-600 font-mono mt-0.5 mb-3">
        van {formatHours(firmHours)} teamcapaciteit
      </p>

      <div className="h-2 rounded-full bg-neutral-800 overflow-hidden mb-3">
        <div
          className={cn("h-full rounded-full transition-all", barColor(tone))}
          style={{ width: `${fill}%` }}
        />
      </div>

      <ul className="space-y-1.5 flex-1">
        {jobs.length === 0 ? (
          <li className="text-[10px] text-neutral-700">Geen geplande last</li>
        ) : (
          jobs.slice(0, 6).map((job) => (
            <li key={job.key} className="min-w-0 flex items-baseline justify-between gap-2">
              <p className="text-[10px] text-neutral-300 truncate leading-tight">{job.name}</p>
              <p className="text-[10px] text-neutral-500 font-mono shrink-0">
                {formatHours(job.hours)}
              </p>
            </li>
          ))
        )}
        {jobs.length > 6 && (
          <li className="text-[10px] text-neutral-600">+{jobs.length - 6} meer</li>
        )}
      </ul>
    </div>
  );
}

export function UtilizationPanel({ rows }: { rows: DealLoadRow[] }) {
  const [tab, setTab] = useState<"week" | "month">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const weeks = useMemo(
    () => buildWeeklyCapacity({ rows, weekCount: VISIBLE_WEEKS, weekOffset }),
    [rows, weekOffset],
  );

  const months = useMemo(
    () => buildMonthlyCapacity({ rows, monthCount: VISIBLE_MONTHS, monthOffset }),
    [rows, monthOffset],
  );

  const firmWeekly = TASK_ASSIGNEES.length * ALLOCATION_WEEKLY_HOURS;
  const peakWeek = weeks.reduce(
    (best, c) => (c.loadPct > best.loadPct ? c : best),
    weeks[0] ?? ({ loadPct: 0, totalHours: 0 } as WeeklyCapacityColumn),
  );
  const peakMonth = months.reduce(
    (best, c) => (c.loadPct > best.loadPct ? c : best),
    months[0] ?? ({ loadPct: 0, totalHours: 0 } as MonthlyCapacityColumn),
  );

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/40">
      <div className="px-5 py-3.5 border-b border-neutral-800 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-neutral-300">Geschatte bezetting</h2>
          <p className="text-xs text-neutral-500 mt-0.5 max-w-xl">
            Als we elke klus op €{TARGET_HOURLY_RATE}/h gelijkmatig tot de deadline verdelen
            (retainers doorlopend). Team = {TASK_ASSIGNEES.length}×{ALLOCATION_WEEKLY_HOURS}h ={" "}
            {firmWeekly}h per week.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 border border-neutral-800 rounded-md p-0.5">
            {(
              [
                { id: "week" as const, label: "Week" },
                { id: "month" as const, label: "Maand" },
              ] as const
            ).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={cn(
                  "px-3 py-1.5 text-xs rounded transition-colors",
                  tab === entry.id
                    ? "bg-neutral-800 text-[#d4e052]"
                    : "text-neutral-500 hover:text-neutral-200",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                tab === "week"
                  ? setWeekOffset((p) => p - VISIBLE_WEEKS)
                  : setMonthOffset((p) => p - VISIBLE_MONTHS)
              }
              className="text-neutral-400 hover:text-neutral-200"
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
              className="text-xs text-neutral-400 hover:text-neutral-200 px-3"
            >
              Nu
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                tab === "week"
                  ? setWeekOffset((p) => p + VISIBLE_WEEKS)
                  : setMonthOffset((p) => p + VISIBLE_MONTHS)
              }
              className="text-neutral-400 hover:text-neutral-200"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-neutral-800/80 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
        {tab === "week" ? (
          <span>
            Drukste week in beeld:{" "}
            <span className={cn("font-mono font-medium", textTone(loadTone(peakWeek.loadPct)))}>
              {formatHours(peakWeek.totalHours)} · {formatPct(peakWeek.loadPct)}
            </span>
          </span>
        ) : (
          <span>
            Drukste maand in beeld:{" "}
            <span className={cn("font-mono font-medium", textTone(loadTone(peakMonth.loadPct)))}>
              {formatHours(peakMonth.totalHours)} · {formatPct(peakMonth.loadPct)}
            </span>
          </span>
        )}
        <span className="text-neutral-700">·</span>
        <span>&lt;85% ok · 85–100% krap · &gt;100% over team</span>
      </div>

      <div className="p-4 overflow-x-auto">
        {tab === "week" ? (
          <div
            className="grid gap-3 min-w-[720px]"
            style={{
              gridTemplateColumns: `repeat(${VISIBLE_WEEKS}, minmax(8rem, 1fr))`,
            }}
          >
            {weeks.map((col) => (
              <PeriodCard
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
              <PeriodCard
                key={col.monthKey}
                title={col.label}
                subtitle={`${col.weekCount} weken · ${formatHours(col.firmHours)} capaciteit`}
                hours={col.totalHours}
                firmHours={col.firmHours}
                loadPct={col.loadPct}
                jobs={col.jobs}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

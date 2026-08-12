"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TARGET_HOURLY_RATE,
  buildDealLoadRows,
  buildWeeklyCapacity,
  type DealLoadRow,
} from "@/lib/deal-capacity";
import { ALLOCATION_WEEKLY_HOURS, TASK_ASSIGNEES } from "@/lib/types";
import type { FinanceDeal, Opportunity, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const VISIBLE_WEEKS = 12;

function formatHours(h: number) {
  if (h <= 0) return "—";
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

export function WeeklyLoadPanel({
  deals,
  projects,
  opportunities,
  rows: rowsProp,
}: {
  deals: FinanceDeal[];
  projects: Project[];
  opportunities: Opportunity[];
  /** Optional precomputed rows (avoids double build when parent already has them). */
  rows?: DealLoadRow[];
}) {
  const [weekOffset, setWeekOffset] = useState(0);

  const rows = useMemo(
    () => rowsProp ?? buildDealLoadRows({ deals, projects, opportunities }),
    [rowsProp, deals, projects, opportunities],
  );

  const columns = useMemo(
    () => buildWeeklyCapacity({ rows, weekCount: VISIBLE_WEEKS, weekOffset }),
    [rows, weekOffset],
  );

  const firmWeekly = TASK_ASSIGNEES.length * ALLOCATION_WEEKLY_HOURS;
  const peak = columns.reduce((max, c) => Math.max(max, c.loadPct), 0);
  const peakTone = loadTone(peak);

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/40">
      <div className="px-5 py-3.5 border-b border-neutral-800 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-neutral-300">Weekly load</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Hours spread evenly to each deadline at €{TARGET_HOURLY_RATE}/h. Team week ={" "}
            {TASK_ASSIGNEES.length}×{ALLOCATION_WEEKLY_HOURS}h = {firmWeekly}h.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekOffset((p) => p - VISIBLE_WEEKS)}
            className="text-neutral-400 hover:text-neutral-200"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekOffset(0)}
            className="text-xs text-neutral-400 hover:text-neutral-200 px-3"
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekOffset((p) => p + VISIBLE_WEEKS)}
            className="text-neutral-400 hover:text-neutral-200"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-neutral-800/80 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
        <span>
          Peak in view:{" "}
          <span className={cn("font-mono font-medium", textTone(peakTone))}>
            {formatPct(peak)} · {formatHours(peak * firmWeekly)}
          </span>
        </span>
        <span className="text-neutral-700">·</span>
        <span>Green &lt; 85% · amber tight · red over team capacity</span>
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid gap-px bg-neutral-800/60 min-w-[720px]"
          style={{ gridTemplateColumns: `repeat(${VISIBLE_WEEKS}, minmax(5.5rem, 1fr))` }}
        >
          {columns.map((col) => {
            const tone = loadTone(col.loadPct);
            const fill = Math.min(100, Math.round(col.loadPct * 100));
            return (
              <div
                key={col.weekKey}
                className="bg-neutral-950/80 px-2.5 py-3 flex flex-col min-h-[220px]"
              >
                <p className="text-[10px] text-neutral-500 leading-snug mb-2">
                  {formatWeekLabel(col.weekStart)}
                </p>
                <p className={cn("font-mono text-sm font-semibold", textTone(tone))}>
                  {formatHours(col.totalHours)}
                </p>
                <p className="text-[10px] text-neutral-600 font-mono mt-0.5 mb-3">
                  {formatPct(col.loadPct)} of team
                </p>

                <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden mb-3">
                  <div
                    className={cn("h-full rounded-full transition-all", barColor(tone))}
                    style={{ width: `${fill}%` }}
                  />
                </div>

                <ul className="space-y-1.5 flex-1">
                  {col.jobs.length === 0 ? (
                    <li className="text-[10px] text-neutral-700">Free</li>
                  ) : (
                    col.jobs.slice(0, 5).map((job) => (
                      <li key={job.key} className="min-w-0">
                        <p className="text-[10px] text-neutral-300 truncate leading-tight">
                          {job.name}
                        </p>
                        <p className="text-[10px] text-neutral-600 font-mono">
                          {formatHours(job.hours)}
                          {job.kind === "retainer" ? " · ret" : ""}
                          {job.source === "opportunity" ? " · pipe" : ""}
                        </p>
                      </li>
                    ))
                  )}
                  {col.jobs.length > 5 && (
                    <li className="text-[10px] text-neutral-600">
                      +{col.jobs.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

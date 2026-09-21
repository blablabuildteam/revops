"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  Pencil,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RetainerLogForm } from "@/components/retainer-log-form";
import {
  currentBillingPeriod,
  defaultWorkDateForWeek,
  entryInPeriod,
  formatDayLabel,
  formatWeekLabel,
  groupRetainerEntriesByWeek,
  includedHoursForPeriod,
  includedHoursForWeek,
  listRetainerBillingPeriods,
  sumHours,
  weekStartFromDateOnly,
} from "@/lib/retainers";
import type { PublicRetainer, PublicRetainerEntry } from "@/lib/types";
import { TASK_ASSIGNEES } from "@/lib/types";
import { cn } from "@/lib/utils";

function CircularProgress({
  value,
  max,
  size = 140,
  strokeWidth = 10,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = max > 0 ? Math.min(value / max, 1) : 0;
  const over = value > max && max > 0;
  const strokeDashoffset = circumference * (1 - percentage);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-neutral-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={cn(
            "transition-all duration-500",
            over ? "text-amber-400" : "text-[#d4e052]"
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums",
            over ? "text-amber-300" : "text-neutral-100"
          )}
        >
          {value.toFixed(1)}
        </span>
        <span className="text-xs text-neutral-500">van {max}u</span>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtext?: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/30">
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={cn(
            "w-4 h-4",
            accent ? "text-[#d4e052]" : "text-neutral-500"
          )}
        />
        <span className="text-xs text-neutral-500 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-lg font-semibold font-mono tabular-nums",
          accent ? "text-[#d4e052]" : "text-neutral-100"
        )}
      >
        {value}
      </p>
      {subtext && <p className="text-xs text-neutral-600 mt-0.5">{subtext}</p>}
    </div>
  );
}

function BucketBar({
  label,
  hours,
  maxHours,
  color,
}: {
  label: string;
  hours: number;
  maxHours: number;
  color: string;
}) {
  const pct = maxHours > 0 ? Math.min((hours / maxHours) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-neutral-300">{label}</span>
        <span className="text-sm font-mono text-neutral-400 tabular-nums">
          {hours.toFixed(1)}u
        </span>
      </div>
      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

const BUCKET_COLORS = [
  "#d4e052",
  "#52b4e0",
  "#e05298",
  "#e09852",
  "#9852e0",
  "#52e098",
];

export type RetainerEntryUpdate = {
  hours: number;
  activity: string;
  category: string | null;
  work_date: string;
  week_start: string;
};

export function RetainerHoursReport({
  retainer,
  onUpdateEntry,
}: {
  retainer: PublicRetainer;
  onUpdateEntry?: (
    entry: PublicRetainerEntry,
    next: RetainerEntryUpdate,
  ) => Promise<void>;
}) {
  const editable = Boolean(onUpdateEntry);
  const entries = retainer.entries ?? [];
  const currentPeriod = currentBillingPeriod(retainer);
  const allPeriods = listRetainerBillingPeriods(retainer).slice().reverse();
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(
    currentPeriod?.key ?? null
  );
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState("");
  const [editActivity, setEditActivity] = useState("");
  const [editWorkDate, setEditWorkDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    setEditingId(null);
  }, [selectedPeriodKey]);

  const selectedPeriod =
    allPeriods.find((p) => p.key === selectedPeriodKey) ?? currentPeriod;
  const periodEntries = selectedPeriod
    ? entries.filter((e) => entryInPeriod(e, selectedPeriod))
    : [];
  const periodHours = sumHours(periodEntries);
  const periodCap = includedHoursForPeriod(retainer);
  const weekCap = includedHoursForWeek(retainer);
  const totalHours = sumHours(entries);
  const remaining = Math.max(0, periodCap - periodHours);
  const isCurrent = selectedPeriod?.key === currentPeriod?.key;

  // Bucket breakdown for selected period
  const bucketHours = (retainer.hour_buckets ?? []).map((bucket, i) => ({
    ...bucket,
    hours: sumHours(periodEntries.filter((e) => e.category === bucket.label)),
    color: BUCKET_COLORS[i % BUCKET_COLORS.length],
  }));
  const uncategorized = sumHours(periodEntries.filter((e) => !e.category));
  const maxBucketHours = Math.max(
    ...bucketHours.map((b) => b.hours),
    uncategorized,
    1
  );

  const weeks = groupRetainerEntriesByWeek(periodEntries);

  // Calculate days remaining in period
  const daysRemaining = selectedPeriod
    ? Math.max(
        0,
        Math.ceil(
          (new Date(selectedPeriod.end).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  function startEdit(entry: PublicRetainerEntry) {
    setEditingId(entry.id);
    setEditHours(String(entry.hours));
    setEditActivity(entry.activity);
    setEditWorkDate(
      entry.work_date || defaultWorkDateForWeek(entry.week_start),
    );
    setEditCategory(entry.category ?? "");
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !onUpdateEntry) return;
    const entry = entries.find((item) => item.id === editingId);
    if (!entry) return;
    const h = parseFloat(editHours);
    if (!editActivity.trim() || !Number.isFinite(h) || h <= 0) return;
    const date =
      editWorkDate || entry.work_date || defaultWorkDateForWeek(entry.week_start);
    setEditSaving(true);
    try {
      await onUpdateEntry(entry, {
        hours: h,
        activity: editActivity.trim(),
        category: editCategory || null,
        work_date: date,
        week_start: weekStartFromDateOnly(date),
      });
      setEditingId(null);
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-semibold text-neutral-100">
          {retainer.client_name}
        </h1>
        <p className="text-neutral-500">
          Retainer urenoverzicht
          {retainer.hours_cadence === "weekly"
            ? ` · ${retainer.hours_included} uur per week`
            : ` · ${retainer.hours_included} uur per maand`}
        </p>
      </div>

      {/* Period selector */}
      {allPeriods.length > 0 && (
        <div className="flex justify-center">
          <div className="flex items-center gap-1 border border-neutral-800 rounded-lg bg-neutral-900/40 p-1">
            {/* Previous period button */}
            <button
              type="button"
              onClick={() => {
                const currentIdx = allPeriods.findIndex(
                  (p) => p.key === selectedPeriodKey
                );
                if (currentIdx < allPeriods.length - 1) {
                  setSelectedPeriodKey(allPeriods[currentIdx + 1].key);
                }
              }}
              disabled={
                allPeriods.findIndex((p) => p.key === selectedPeriodKey) >=
                allPeriods.length - 1
              }
              className="p-2 text-neutral-500 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Vorige periode"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Period dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-800 rounded-md transition-colors min-w-[180px] justify-center"
              >
                <Calendar className="w-4 h-4 text-neutral-400" />
                <span className="text-sm text-neutral-200">
                  {selectedPeriod?.label ?? "Kies periode"}
                </span>
                {isCurrent && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#d4e052]/20 text-[#d4e052]">
                    Nu
                  </span>
                )}
                {allPeriods.length > 1 && (
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-neutral-500 transition-transform",
                      periodDropdownOpen && "rotate-180"
                    )}
                  />
                )}
              </button>
              {periodDropdownOpen && allPeriods.length > 1 && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 py-1 border border-neutral-700 rounded-lg bg-neutral-900 shadow-xl z-10 max-h-64 overflow-y-auto min-w-[200px]">
                  {allPeriods.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        setSelectedPeriodKey(p.key);
                        setPeriodDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full px-4 py-2 text-left text-sm hover:bg-neutral-800 transition-colors flex items-center justify-between gap-2",
                        p.key === selectedPeriodKey
                          ? "text-[#d4e052]"
                          : "text-neutral-300"
                      )}
                    >
                      <span>{p.label}</span>
                      {p.key === currentPeriod?.key && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#d4e052]/20 text-[#d4e052]">
                          Nu
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Next period button */}
            <button
              type="button"
              onClick={() => {
                const currentIdx = allPeriods.findIndex(
                  (p) => p.key === selectedPeriodKey
                );
                if (currentIdx > 0) {
                  setSelectedPeriodKey(allPeriods[currentIdx - 1].key);
                }
              }}
              disabled={
                allPeriods.findIndex((p) => p.key === selectedPeriodKey) <= 0
              }
              className="p-2 text-neutral-500 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Volgende periode"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Jump to current */}
            {!isCurrent && currentPeriod && (
              <button
                type="button"
                onClick={() => setSelectedPeriodKey(currentPeriod.key)}
                className="ml-1 px-2 py-1.5 text-xs text-neutral-500 hover:text-[#d4e052] transition-colors"
              >
                Nu
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hero stats */}
      {selectedPeriod ? (
        <div className="border border-neutral-800 rounded-xl p-6 bg-gradient-to-br from-neutral-900/80 to-neutral-950">
          <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
            <CircularProgress value={periodHours} max={periodCap} />
            <div className="flex-1 space-y-4 text-center sm:text-left">
              <div>
                <p className="text-lg font-medium text-neutral-100">
                  {selectedPeriod.label}
                </p>
                {isCurrent && daysRemaining > 0 && (
                  <p className="text-sm text-neutral-500 mt-1">
                    Nog {daysRemaining} dag{daysRemaining !== 1 ? "en" : ""} in
                    deze periode
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-2xl font-semibold text-[#d4e052] font-mono tabular-nums">
                    {remaining.toFixed(1)}u
                  </p>
                  <p className="text-xs text-neutral-500">beschikbaar</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-neutral-100 font-mono tabular-nums">
                    {periodEntries.length}
                  </p>
                  <p className="text-xs text-neutral-500">activiteiten</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-neutral-800 rounded-xl p-8 text-center">
          <Clock className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-500">Nog geen actieve periode</p>
          <p className="text-xs text-neutral-600 mt-1">
            Retainer start op {retainer.start_date}
          </p>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={Clock}
          label="Deze periode"
          value={`${periodHours.toFixed(1)}u`}
          subtext={`van ${periodCap}u`}
        />
        <StatCard
          icon={TrendingUp}
          label="Totaal gelogd"
          value={`${totalHours.toFixed(1)}u`}
          subtext="alle periodes"
        />
        <StatCard
          icon={Layers}
          label="Categorieën"
          value={`${bucketHours.filter((b) => b.hours > 0).length}`}
          subtext={`van ${retainer.hour_buckets?.length ?? 0}`}
        />
        <StatCard
          icon={Calendar}
          label="Per week"
          value={`${weekCap}u`}
          subtext="inclusief"
          accent
        />
      </div>

      {/* Bucket breakdown */}
      {(bucketHours.some((b) => b.hours > 0) || uncategorized > 0) && (
        <div className="border border-neutral-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-neutral-500" />
            <h2 className="text-sm font-medium text-neutral-300">
              Verdeling per categorie
            </h2>
          </div>
          <div className="space-y-3">
            {bucketHours
              .filter((b) => b.hours > 0)
              .sort((a, b) => b.hours - a.hours)
              .map((bucket) => (
                <BucketBar
                  key={bucket.id}
                  label={bucket.label}
                  hours={bucket.hours}
                  maxHours={maxBucketHours}
                  color={bucket.color}
                />
              ))}
            {uncategorized > 0 && (
              <BucketBar
                label="Overig"
                hours={uncategorized}
                maxHours={maxBucketHours}
                color="#737373"
              />
            )}
          </div>
        </div>
      )}

      {/* Week-by-week breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-neutral-300">
            Gelogde activiteiten
          </h2>
          <span className="text-xs text-neutral-600">
            {editable
              ? "Klik een regel om te bewerken"
              : `${periodEntries.length} item${periodEntries.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {weeks.length === 0 ? (
          <div className="border border-neutral-800 rounded-lg p-8 text-center">
            <Clock className="w-8 h-8 text-neutral-700 mx-auto mb-2" />
            <p className="text-sm text-neutral-600">
              Nog geen uren gelogd deze periode
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {weeks.map(({ weekStart, entries: weekEntries }) => {
              const weekTotal = sumHours(weekEntries);
              const weekOver = weekTotal > weekCap;
              return (
                <div key={weekStart} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-3">
                      <span className="text-sm font-medium text-neutral-200">
                        {formatWeekLabel(weekStart)}
                      </span>
                      <div className="flex-1 h-px bg-neutral-800" />
                    </div>
                    <span
                      className={cn(
                        "text-sm font-mono tabular-nums",
                        weekOver ? "text-amber-300" : "text-neutral-400"
                      )}
                    >
                      {weekTotal.toFixed(1)}u
                      {weekOver && (
                        <span className="text-amber-400/70 ml-1">
                          (+{(weekTotal - weekCap).toFixed(1)})
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="border border-neutral-800 rounded-lg overflow-hidden divide-y divide-neutral-800/80">
                    {weekEntries.map((entry) =>
                      editable && editingId === entry.id ? (
                        <div key={entry.id} className="p-2.5 bg-neutral-950/30">
                          <RetainerLogForm
                            values={{
                              hours: editHours,
                              workDate: editWorkDate,
                              activity: editActivity,
                              category: editCategory,
                              loggedBy: TASK_ASSIGNEES[0],
                            }}
                            onChange={(patch) => {
                              if (patch.hours !== undefined) {
                                setEditHours(patch.hours);
                              }
                              if (patch.workDate !== undefined) {
                                setEditWorkDate(patch.workDate);
                              }
                              if (patch.activity !== undefined) {
                                setEditActivity(patch.activity);
                              }
                              if (patch.category !== undefined) {
                                setEditCategory(patch.category);
                              }
                            }}
                            buckets={retainer.hour_buckets ?? []}
                            saving={editSaving}
                            submitLabel="Opslaan"
                            submitIcon={Check}
                            showLoggedBy={false}
                            onSubmit={(e) => void handleUpdate(e)}
                            onCancel={() => setEditingId(null)}
                            autoFocus
                            extraActions={
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditingId(null)}
                                className="h-9 border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
                              >
                                Annuleren
                              </Button>
                            }
                          />
                        </div>
                      ) : (
                      <div
                        key={entry.id}
                        className={cn(
                          "flex items-start gap-4 px-4 py-3 bg-neutral-950/30 transition-colors",
                          editable &&
                            "hover:bg-neutral-900/50 cursor-pointer group",
                          !editable && "hover:bg-neutral-900/30",
                        )}
                        {...(editable
                          ? {
                              role: "button",
                              tabIndex: 0,
                              title: "Klik om te bewerken",
                              onClick: () => startEdit(entry),
                              onKeyDown: (e: React.KeyboardEvent) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  startEdit(entry);
                                }
                              },
                            }
                          : {})}
                      >
                        <div className="w-20 shrink-0">
                          <span className="text-xs text-neutral-500 font-mono">
                            {formatDayLabel(
                              entry.work_date || entry.week_start
                            )}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-neutral-200">
                            {entry.activity}
                          </p>
                          {entry.category && (
                            <span
                              className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: `${
                                  bucketHours.find(
                                    (b) => b.label === entry.category
                                  )?.color ?? "#737373"
                                }20`,
                                color:
                                  bucketHours.find(
                                    (b) => b.label === entry.category
                                  )?.color ?? "#737373",
                              }}
                            >
                              {entry.category}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-sm text-neutral-300 tabular-nums shrink-0">
                          {Number(entry.hours).toFixed(1)}u
                        </span>
                        {editable && (
                          <Pencil className="w-3.5 h-3.5 text-neutral-700 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 mt-0.5 shrink-0" />
                        )}
                      </div>
                      ),
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

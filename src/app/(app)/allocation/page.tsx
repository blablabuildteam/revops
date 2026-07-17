"use client";

export const dynamic = "force-dynamic";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjects, useAllocations, useOpportunities, useUsers } from "@/hooks/use-api-data";
import { saveAllocations, type AllocationEntry } from "@/lib/api";
import { UserAvatar } from "@/components/user-avatar";
import { avatarForName } from "@/components/assignee-select";
import { useSession } from "@/components/session-provider";
import {
  TASK_ASSIGNEES,
  ALLOCATION_GENERIC_ID,
  ALLOCATION_PERCENT_PRESETS,
  ALLOCATION_HOUR_PRESETS,
  ALLOCATION_WEEKLY_HOURS,
  ALLOCATION_DEFAULT_UNIT,
  percentToHours,
  hoursToPercent,
  formatAllocationHours,
  STAGE_ORDER,
  type AllocationTargetType,
  type AllocationUnit,
  type Stage,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** Default unit for the whole page is based on who is logged in. */
function defaultUnitForViewer(viewerName: string): AllocationUnit {
  return ALLOCATION_DEFAULT_UNIT[viewerName] ?? "percent";
}

function unitStorageKey(viewerName: string, person: string) {
  return `alloc-unit:${viewerName}:${person}`;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addWeeks(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n * 7);
  return result;
}

function formatWeekKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Normalize API week values to YYYY-MM-DD (handles DATE→ISO timezone shifts). */
function normalizeWeekKey(week: string | Date): string {
  if (week instanceof Date) return formatWeekKey(week);
  const raw = String(week);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // ISO timestamps from DATE columns are midnight local shifted to UTC
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return formatWeekKey(parsed);
  return raw.slice(0, 10);
}

function formatWeekRange(d: Date): string {
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(d)} – ${fmt(end)}`;
}

const VISIBLE_WEEKS = 8;
const OPEN_OPP_STAGES = new Set<Stage>([
  "prospect",
  "qualified",
  "proposal",
  "negotiation",
  "on_hold",
]);

type CellKey = string;

function cellKey(
  person: string,
  targetType: AllocationTargetType,
  targetId: string,
  week: string
): CellKey {
  return `${person}|${targetType}|${targetId}|${week}`;
}

type AllocRow = {
  targetType: AllocationTargetType;
  targetId: string;
  name: string;
  subtitle?: string;
};

type DragState = {
  person: string;
  targetType: AllocationTargetType;
  targetId: string;
  percentage: number;
  startWeekIdx: number;
  lastWeekIdx: number;
};

export default function AllocationPage() {
  const { user } = useSession();
  const viewerName = user?.name ?? "";
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: opportunities = [], isLoading: oppsLoading } = useOpportunities();
  const { data: allocations = [], isLoading: allocationsLoading } = useAllocations();
  const { data: users = [] } = useUsers();

  const orderedAssignees = useMemo(() => {
    const list = [...TASK_ASSIGNEES];
    if (!viewerName) return list;
    return list.sort((a, b) => {
      if (a === viewerName) return -1;
      if (b === viewerName) return 1;
      return a.localeCompare(b);
    });
  }, [viewerName]);

  const loading =
    (projectsLoading && projects.length === 0) ||
    (oppsLoading && opportunities.length === 0) ||
    (allocationsLoading && allocations.length === 0);

  const [weekOffset, setWeekOffset] = useState(0);
  const [localEdits, setLocalEdits] = useState<Map<CellKey, number>>(new Map());
  const [activePicker, setActivePicker] = useState<{
    person: string;
    targetType: AllocationTargetType;
    targetId: string;
    week: string;
  } | null>(null);
  const [dragHighlight, setDragHighlight] = useState<{
    person: string;
    targetType: AllocationTargetType;
    targetId: string;
    from: number;
    to: number;
  } | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSavesRef = useRef<Map<CellKey, number>>(new Map());
  const dragRef = useRef<DragState | null>(null);

  const activeProjects = useMemo(
    () =>
      projects
        .filter((p) => p.status === "active" || p.status === "on_hold")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );

  const openOpportunities = useMemo(
    () =>
      opportunities
        .filter((o) => OPEN_OPP_STAGES.has(o.stage))
        .sort((a, b) => {
          const byStage =
            STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
          if (byStage !== 0) return byStage;
          return a.name.localeCompare(b.name);
        }),
    [opportunities]
  );

  const today = useMemo(() => getMonday(new Date()), []);
  const weeks = useMemo(() => {
    const startMonday = addWeeks(today, weekOffset);
    return Array.from({ length: VISIBLE_WEEKS }, (_, i) => addWeeks(startMonday, i));
  }, [today, weekOffset]);

  const allocationMap = useMemo(() => {
    const map = new Map<CellKey, number>();
    for (const a of allocations) {
      const weekDate = normalizeWeekKey(a.week);
      const targetType = (a.target_type ?? "project") as AllocationTargetType;
      const targetId = a.target_id ?? (a as { project_id?: string }).project_id ?? "";
      if (!targetId) continue;
      map.set(cellKey(a.person, targetType, targetId, weekDate), Number(a.percentage) || 0);
    }
    return map;
  }, [allocations]);

  const getValue = useCallback(
    (person: string, targetType: AllocationTargetType, targetId: string, week: string): number => {
      const key = cellKey(person, targetType, targetId, week);
      if (localEdits.has(key)) return localEdits.get(key)!;
      return allocationMap.get(key) ?? 0;
    },
    [allocationMap, localEdits]
  );

  const allRowsForTotals = useCallback(
    (person: string): AllocRow[] => {
      void person;
      return [
        {
          targetType: "generic",
          targetId: ALLOCATION_GENERIC_ID,
          name: "General",
        },
        ...activeProjects.map((p) => ({
          targetType: "project" as const,
          targetId: p.id,
          name: p.name,
        })),
        ...openOpportunities.map((o) => ({
          targetType: "opportunity" as const,
          targetId: o.id,
          name: o.name,
        })),
      ];
    },
    [activeProjects, openOpportunities]
  );

  const getWeekTotal = useCallback(
    (person: string, week: string): number => {
      let total = 0;
      for (const row of allRowsForTotals(person)) {
        total += getValue(person, row.targetType, row.targetId, week);
      }
      return total;
    },
    [allRowsForTotals, getValue]
  );

  const flushSaves = useCallback(async () => {
    const batch = new Map(pendingSavesRef.current);
    pendingSavesRef.current.clear();
    if (batch.size === 0) return;

    const entries: AllocationEntry[] = Array.from(batch.entries()).map(([key, percentage]) => {
      const [person, target_type, target_id, week] = key.split("|");
      return {
        person,
        target_type: target_type as AllocationTargetType,
        target_id,
        week,
        percentage,
      };
    });

    try {
      await saveAllocations(entries);
      // Cache is updated with the full list; drop matching optimistic edits
      setLocalEdits((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        for (const [key] of batch) next.delete(key);
        return next;
      });
    } catch {
      // Keep optimistic values visible and re-queue so the next edit flushes them too
      for (const [key, percentage] of batch) {
        if (!pendingSavesRef.current.has(key)) {
          pendingSavesRef.current.set(key, percentage);
        }
      }
    }
  }, []);

  const applyValue = useCallback(
    (
      person: string,
      targetType: AllocationTargetType,
      targetId: string,
      week: string,
      value: number
    ) => {
      if (!viewerName || person !== viewerName) return;

      const key = cellKey(person, targetType, targetId, week);
      const clamped = Math.max(0, Math.min(100, Math.round(value)));

      setLocalEdits((prev) => {
        const next = new Map(prev);
        next.set(key, clamped);
        return next;
      });
      pendingSavesRef.current.set(key, clamped);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushSaves, 500);
    },
    [flushSaves, viewerName]
  );

  const applyRange = useCallback(
    (
      person: string,
      targetType: AllocationTargetType,
      targetId: string,
      fromIdx: number,
      toIdx: number,
      percentage: number
    ) => {
      const lo = Math.min(fromIdx, toIdx);
      const hi = Math.max(fromIdx, toIdx);
      for (let i = lo; i <= hi; i++) {
        if (!weeks[i]) continue;
        applyValue(person, targetType, targetId, formatWeekKey(weeks[i]), percentage);
      }
    },
    [applyValue, weeks]
  );

  // Flush pending saves on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingSavesRef.current.size > 0) {
        const entries = Array.from(pendingSavesRef.current.entries()).map(([key, percentage]) => {
          const [person, target_type, target_id, week] = key.split("|");
          return {
            person,
            target_type: target_type as AllocationTargetType,
            target_id,
            week,
            percentage,
          };
        });
        void saveAllocations(entries);
      }
    };
  }, []);

  // Document-level drag-fill across week columns
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest?.("[data-alloc-week-idx]") as HTMLElement | null;
      if (!cell) return;

      if (
        cell.dataset.allocPerson !== d.person ||
        cell.dataset.allocType !== d.targetType ||
        cell.dataset.allocId !== d.targetId
      ) {
        return;
      }

      const weekIdx = Number(cell.dataset.allocWeekIdx);
      if (Number.isNaN(weekIdx) || weekIdx === d.lastWeekIdx) return;

      d.lastWeekIdx = weekIdx;
      applyRange(d.person, d.targetType, d.targetId, d.startWeekIdx, weekIdx, d.percentage);
      setDragHighlight({
        person: d.person,
        targetType: d.targetType,
        targetId: d.targetId,
        from: Math.min(d.startWeekIdx, weekIdx),
        to: Math.max(d.startWeekIdx, weekIdx),
      });
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragHighlight(null);
      document.body.classList.remove("select-none");
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyRange]);

  const isCurrentWeek = useCallback(
    (weekDate: Date) => formatWeekKey(weekDate) === formatWeekKey(today),
    [today]
  );

  const beginDragFill = useCallback(
    (
      person: string,
      targetType: AllocationTargetType,
      targetId: string,
      weekIdx: number,
      percentage: number
    ) => {
      if (percentage <= 0) return;
      if (!viewerName || person !== viewerName) return;
      dragRef.current = {
        person,
        targetType,
        targetId,
        percentage,
        startWeekIdx: weekIdx,
        lastWeekIdx: weekIdx,
      };
      setActivePicker(null);
      setDragHighlight({
        person,
        targetType,
        targetId,
        from: weekIdx,
        to: weekIdx,
      });
      document.body.classList.add("select-none");
    },
    [viewerName]
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <Users className="w-6 h-6 text-[#e8ff47]" />
          <h1 className="text-xl font-semibold text-neutral-100">Allocation</h1>
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-48 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-[#e8ff47]" />
          <h1 className="text-xl font-semibold text-neutral-100">Allocation</h1>
          <span className="text-xs text-neutral-600 ml-2">
            {activeProjects.length} project{activeProjects.length !== 1 ? "s" : ""}
            {" · "}
            {openOpportunities.length} opportunit{openOpportunities.length !== 1 ? "ies" : "y"}
          </span>
        </div>
        <div className="flex items-center gap-1">
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

      <p className="text-xs text-neutral-600 mb-4">
        Click a cell to set allocation, or drag horizontally to fill consecutive weeks.
        Hours use a {ALLOCATION_WEEKLY_HOURS}h week (= 100%).
      </p>

      <div className="space-y-6">
        {orderedAssignees.map((person) => {
          const canEdit = Boolean(viewerName && person === viewerName);
          return (
            <PersonAllocation
              key={person}
              person={person}
              viewerName={viewerName}
              canEdit={canEdit}
              avatarUrl={avatarForName(users, person)}
              projects={activeProjects}
              opportunities={openOpportunities}
              weeks={weeks}
              getValue={getValue}
              getWeekTotal={getWeekTotal}
              onPick={(targetType, targetId, week, pct) => {
                if (!canEdit) return;
                applyValue(person, targetType, targetId, week, pct);
                setActivePicker(null);
              }}
              activePicker={
                activePicker?.person === person
                  ? {
                      targetType: activePicker.targetType,
                      targetId: activePicker.targetId,
                      week: activePicker.week,
                    }
                  : null
              }
              onOpenPicker={(targetType, targetId, week) => {
                if (!canEdit) return;
                setActivePicker({ person, targetType, targetId, week });
              }}
              onClosePicker={() => setActivePicker(null)}
              isCurrentWeek={isCurrentWeek}
              onDragFillStart={(targetType, targetId, weekIdx, pct) =>
                beginDragFill(person, targetType, targetId, weekIdx, pct)
              }
              dragHighlight={
                dragHighlight?.person === person ? dragHighlight : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function PersonAllocation({
  person,
  viewerName,
  canEdit,
  avatarUrl,
  projects,
  opportunities,
  weeks,
  getValue,
  getWeekTotal,
  onPick,
  activePicker,
  onOpenPicker,
  onClosePicker,
  isCurrentWeek,
  onDragFillStart,
  dragHighlight,
}: {
  person: string;
  viewerName: string;
  canEdit: boolean;
  avatarUrl?: string | null;
  projects: { id: string; name: string; company?: { name: string } | null }[];
  opportunities: {
    id: string;
    name: string;
    stage: Stage;
    company?: { name: string } | null;
  }[];
  weeks: Date[];
  getValue: (
    person: string,
    targetType: AllocationTargetType,
    targetId: string,
    week: string
  ) => number;
  getWeekTotal: (person: string, week: string) => number;
  onPick: (
    targetType: AllocationTargetType,
    targetId: string,
    week: string,
    pct: number
  ) => void;
  activePicker: {
    targetType: AllocationTargetType;
    targetId: string;
    week: string;
  } | null;
  onOpenPicker: (
    targetType: AllocationTargetType,
    targetId: string,
    week: string
  ) => void;
  onClosePicker: () => void;
  isCurrentWeek: (d: Date) => boolean;
  onDragFillStart: (
    targetType: AllocationTargetType,
    targetId: string,
    weekIdx: number,
    pct: number
  ) => void;
  dragHighlight: {
    targetType: AllocationTargetType;
    targetId: string;
    from: number;
    to: number;
  } | null;
}) {
  const [unit, setUnit] = useState<AllocationUnit>(() =>
    defaultUnitForViewer(viewerName)
  );

  useEffect(() => {
    const fallback = defaultUnitForViewer(viewerName);
    setUnit(fallback);
    if (!viewerName) return;
    try {
      const stored = window.localStorage.getItem(unitStorageKey(viewerName, person));
      if (stored === "percent" || stored === "hours") setUnit(stored);
    } catch {
      // ignore
    }
  }, [viewerName, person]);

  const setUnitPersist = (next: AllocationUnit) => {
    setUnit(next);
    onClosePicker();
    if (!viewerName) return;
    try {
      window.localStorage.setItem(unitStorageKey(viewerName, person), next);
    } catch {
      // ignore quota / private mode
    }
  };

  const rowProps = {
    person,
    weeks,
    getValue,
    onPick,
    activePicker,
    onOpenPicker,
    onClosePicker,
    isCurrentWeek,
    onDragFillStart,
    dragHighlight,
    unit,
    canEdit,
  };
  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-950">
      <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <UserAvatar name={person} avatarUrl={avatarUrl} size="sm" />
          <h2 className="text-sm font-semibold text-neutral-200">{person}</h2>
          {!canEdit && (
            <span className="text-[10px] uppercase tracking-wider text-neutral-600">
              View only
            </span>
          )}
        </div>
        <div className="flex items-center rounded-md border border-neutral-700 p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setUnitPersist("percent")}
            className={cn(
              "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors",
              unit === "percent"
                ? "bg-[#e8ff47] text-neutral-950"
                : "text-neutral-500 hover:text-neutral-200"
            )}
          >
            %
          </button>
          <button
            type="button"
            onClick={() => setUnitPersist("hours")}
            className={cn(
              "px-2.5 py-1 text-[11px] font-semibold rounded transition-colors",
              unit === "hours"
                ? "bg-[#e8ff47] text-neutral-950"
                : "text-neutral-500 hover:text-neutral-200"
            )}
          >
            H
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className="text-left px-4 py-2.5 text-neutral-500 font-medium w-52 sticky left-0 bg-neutral-950 z-10">
                Item
              </th>
              {weeks.map((w) => {
                const weekKey = formatWeekKey(w);
                const current = isCurrentWeek(w);
                const total = getWeekTotal(person, weekKey);
                const fill = Math.min(total, 100);
                const isOver = total > 100;
                const isPerfect = total === 100;
                const totalLabel =
                  unit === "hours"
                    ? formatAllocationHours(percentToHours(total))
                    : `${total}%`;
                return (
                  <th
                    key={weekKey}
                    className={cn(
                      "px-2 py-2.5 text-center font-medium min-w-[110px]",
                      current ? "text-[#e8ff47] bg-[#e8ff47]/5" : "text-neutral-500"
                    )}
                  >
                    <div className="whitespace-nowrap leading-tight">{formatWeekRange(w)}</div>
                    <div
                      className="mt-1.5 mx-auto h-1 w-full max-w-[72px] rounded-full bg-neutral-800 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={total}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${totalLabel} allocated`}
                      title={totalLabel}
                    >
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isOver
                            ? "bg-red-400"
                            : isPerfect
                              ? "bg-green-500"
                              : total > 0
                                ? "bg-amber-400"
                                : "bg-transparent"
                        )}
                        style={{ width: `${fill}%` }}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <SectionLabel weeks={weeks.length} label="General" />
            <AllocRowView
              {...rowProps}
              row={{
                targetType: "generic",
                targetId: ALLOCATION_GENERIC_ID,
                name: "General / other",
                subtitle: "Admin, sales, unassigned",
              }}
            />

            {projects.length > 0 && (
              <>
                <SectionLabel weeks={weeks.length} label="Projects" />
                {projects.map((project) => (
                  <AllocRowView
                    key={project.id}
                    {...rowProps}
                    row={{
                      targetType: "project",
                      targetId: project.id,
                      name: project.company?.name
                        ? `${project.company.name} – ${project.name}`
                        : project.name,
                    }}
                  />
                ))}
              </>
            )}

            {opportunities.length > 0 && (
              <>
                <SectionLabel weeks={weeks.length} label="Opportunities" />
                {opportunities.map((opp) => (
                  <AllocRowView
                    key={opp.id}
                    {...rowProps}
                    row={{
                      targetType: "opportunity",
                      targetId: opp.id,
                      name: opp.company?.name
                        ? `${opp.company.name} – ${opp.name}`
                        : opp.name,
                    }}
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionLabel({ weeks, label }: { weeks: number; label: string }) {
  return (
    <tr className="bg-neutral-900/40">
      <td
        colSpan={weeks + 1}
        className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-neutral-600 font-medium sticky left-0"
      >
        {label}
      </td>
    </tr>
  );
}

function AllocRowView({
  person,
  row,
  weeks,
  getValue,
  onPick,
  activePicker,
  onOpenPicker,
  onClosePicker,
  isCurrentWeek,
  onDragFillStart,
  dragHighlight,
  unit,
  canEdit,
}: {
  person: string;
  row: AllocRow;
  weeks: Date[];
  getValue: (
    person: string,
    targetType: AllocationTargetType,
    targetId: string,
    week: string
  ) => number;
  onPick: (
    targetType: AllocationTargetType,
    targetId: string,
    week: string,
    pct: number
  ) => void;
  activePicker: {
    targetType: AllocationTargetType;
    targetId: string;
    week: string;
  } | null;
  onOpenPicker: (
    targetType: AllocationTargetType,
    targetId: string,
    week: string
  ) => void;
  onClosePicker: () => void;
  isCurrentWeek: (d: Date) => boolean;
  onDragFillStart: (
    targetType: AllocationTargetType,
    targetId: string,
    weekIdx: number,
    pct: number
  ) => void;
  dragHighlight: {
    targetType: AllocationTargetType;
    targetId: string;
    from: number;
    to: number;
  } | null;
  unit: AllocationUnit;
  canEdit: boolean;
}) {
  const rowDragging =
    dragHighlight?.targetType === row.targetType &&
    dragHighlight?.targetId === row.targetId;

  return (
    <tr className="border-b border-neutral-800/50 hover:bg-neutral-900/30 transition-colors">
      <td className="px-4 py-1.5 sticky left-0 bg-neutral-950 z-10">
        <div className="text-neutral-300 truncate max-w-[200px]" title={row.name}>
          {row.name}
        </div>
        {row.subtitle && (
          <div className="text-[10px] text-neutral-600 truncate max-w-[200px]">
            {row.subtitle}
          </div>
        )}
      </td>
      {weeks.map((w, weekIdx) => {
        const weekKey = formatWeekKey(w);
        const value = getValue(person, row.targetType, row.targetId, weekKey);
        const current = isCurrentWeek(w);
        const isOpen =
          activePicker?.targetType === row.targetType &&
          activePicker?.targetId === row.targetId &&
          activePicker?.week === weekKey;
        const inDragRange =
          rowDragging &&
          dragHighlight != null &&
          weekIdx >= dragHighlight.from &&
          weekIdx <= dragHighlight.to;

        return (
          <td
            key={weekKey}
            data-alloc-person={person}
            data-alloc-type={row.targetType}
            data-alloc-id={row.targetId}
            data-alloc-week-idx={weekIdx}
            className={cn(
              "px-1 py-1 relative",
              current && "bg-[#e8ff47]/5",
              inDragRange && "bg-[#e8ff47]/15"
            )}
          >
            <AllocationCell
              value={value}
              unit={unit}
              canEdit={canEdit}
              open={isOpen && canEdit}
              onOpen={() => onOpenPicker(row.targetType, row.targetId, weekKey)}
              onClose={onClosePicker}
              onPick={(pct) => onPick(row.targetType, row.targetId, weekKey, pct)}
              onDragFillStart={() =>
                onDragFillStart(row.targetType, row.targetId, weekIdx, value)
              }
            />
          </td>
        );
      })}
    </tr>
  );
}

function AllocationCell({
  value,
  unit,
  canEdit,
  open,
  onOpen,
  onClose,
  onPick,
  onDragFillStart,
}: {
  value: number;
  unit: AllocationUnit;
  canEdit: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (pct: number) => void;
  onDragFillStart: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const hoursInputRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<{
    x: number;
    y: number;
    dragging: boolean;
  } | null>(null);
  const hours = percentToHours(value);
  const [hoursDraft, setHoursDraft] = useState("");

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || unit !== "hours") return;
    setHoursDraft(hours > 0 ? String(hours) : "");
    const id = window.setTimeout(() => {
      hoursInputRef.current?.focus();
      hoursInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, unit, hours]);

  const pickPercent = (pct: number) => (e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onPick(pct);
  };

  const commitHours = (raw: string) => {
    const parsed = parseFloat(raw.replace(",", "."));
    if (raw.trim() === "" || Number.isNaN(parsed) || parsed <= 0) {
      onPick(0);
      return;
    }
    onPick(hoursToPercent(parsed));
  };

  const display =
    value > 0
      ? unit === "hours"
        ? formatAllocationHours(hours)
        : `${value}%`
      : "–";

  if (!canEdit) {
    return (
      <div
        className={cn(
          "w-full h-7 px-1.5 rounded text-center text-xs flex items-center justify-center select-none",
          value > 0
            ? "bg-neutral-800/60 text-neutral-400 font-medium"
            : "text-neutral-700"
        )}
      >
        {display}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (gestureRef.current?.dragging) {
            gestureRef.current = null;
            return;
          }
          if (open) onClose();
          else onOpen();
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          gestureRef.current = { x: e.clientX, y: e.clientY, dragging: false };
          if (value > 0) {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          const g = gestureRef.current;
          if (!g || g.dragging) return;
          if (value <= 0) return;
          const dx = Math.abs(e.clientX - g.x);
          const dy = Math.abs(e.clientY - g.y);
          if (dx > 5 && dx >= dy) {
            g.dragging = true;
            onClose();
            onDragFillStart();
          }
        }}
        onPointerUp={(e) => {
          try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {
            // ignore if not capturing
          }
          window.setTimeout(() => {
            if (gestureRef.current && !gestureRef.current.dragging) {
              gestureRef.current = null;
            }
          }, 0);
        }}
        className={cn(
          "w-full h-7 px-1.5 rounded text-center text-xs transition-colors select-none",
          value > 0
            ? "bg-[#e8ff47]/10 text-[#e8ff47] hover:bg-[#e8ff47]/20 font-medium cursor-grab active:cursor-grabbing"
            : "text-neutral-700 hover:bg-neutral-800 hover:text-neutral-400 cursor-pointer",
          open && "ring-1 ring-[#e8ff47]/50"
        )}
      >
        {display}
      </button>

      {open && unit === "percent" && (
        <div
          ref={popRef}
          className="absolute z-30 top-8 left-1/2 -translate-x-1/2 w-44 rounded-md border border-neutral-700 bg-neutral-900 p-2 shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-5 gap-1 mb-1.5">
            {ALLOCATION_PERCENT_PRESETS.map((pct) => (
              <button
                key={pct}
                type="button"
                onPointerDown={pickPercent(pct)}
                className={cn(
                  "h-7 rounded text-[11px] font-medium transition-colors",
                  value === pct
                    ? "bg-[#e8ff47] text-neutral-950"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                )}
              >
                {pct}
              </button>
            ))}
          </div>
          <button
            type="button"
            onPointerDown={pickPercent(0)}
            className="w-full h-7 rounded text-[11px] text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {open && unit === "hours" && (
        <div
          ref={popRef}
          className="absolute z-30 top-8 left-1/2 -translate-x-1/2 w-48 rounded-md border border-neutral-700 bg-neutral-900 p-2 shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <input
              ref={hoursInputRef}
              type="text"
              inputMode="decimal"
              value={hoursDraft}
              onChange={(e) =>
                setHoursDraft(e.target.value.replace(/[^0-9.,]/g, ""))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitHours(hoursDraft);
                } else if (e.key === "Escape") {
                  onClose();
                }
              }}
              onBlur={() => {
                // Don't commit on blur if clicking a preset — presets use pointerdown first
              }}
              placeholder="Hours"
              className="flex-1 h-7 px-2 rounded bg-neutral-800 border border-neutral-700 text-xs text-neutral-100 outline-none focus:border-[#e8ff47]/50"
            />
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                commitHours(hoursDraft);
              }}
              className="h-7 px-2 rounded text-[11px] font-medium bg-[#e8ff47] text-neutral-950 hover:bg-[#e8ff47]/90"
            >
              Set
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1 mb-1.5">
            {ALLOCATION_HOUR_PRESETS.map((h) => (
              <button
                key={h}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick(hoursToPercent(h));
                }}
                className={cn(
                  "h-7 rounded text-[11px] font-medium transition-colors",
                  hours === h
                    ? "bg-[#e8ff47] text-neutral-950"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                )}
              >
                {h}
              </button>
            ))}
          </div>
          <button
            type="button"
            onPointerDown={pickPercent(0)}
            className="w-full h-7 rounded text-[11px] text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

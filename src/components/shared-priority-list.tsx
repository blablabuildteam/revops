"use client";

import { useMemo, useState } from "react";
import { Task } from "@/lib/types";
import {
  ROADMAP_PRIORITIES,
  ROADMAP_PRIORITY_HINT,
  ROADMAP_PRIORITY_LABEL,
  ROADMAP_PRIORITY_WINDOW,
  RoadmapPriority,
  normalizeRoadmapPriority,
  roadmapSortKey,
} from "@/lib/roadmap-priority";

type PrioritySide = "team" | "partner";

function PriorityChips({
  value,
  onChange,
  disabled,
  label,
}: {
  value: RoadmapPriority | null;
  onChange: (next: RoadmapPriority | null) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-12 shrink-0">
        {label}
      </span>
      {ROADMAP_PRIORITIES.map((level) => {
        const active = value === level;
        return (
          <button
            key={level}
            type="button"
            disabled={disabled}
            title={`${ROADMAP_PRIORITY_HINT[level]} · ${ROADMAP_PRIORITY_WINDOW[level]}`}
            onClick={() => onChange(active ? null : level)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium border transition-colors disabled:opacity-40 ${
              active
                ? level === "p1"
                  ? "border-red-400/60 bg-red-400/15 text-red-300"
                  : level === "p2"
                    ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                    : "border-sky-400/60 bg-sky-400/15 text-sky-300"
                : "border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300"
            }`}
          >
            {ROADMAP_PRIORITY_LABEL[level]}
          </button>
        );
      })}
    </div>
  );
}

function alignmentLabel(team: RoadmapPriority | null, partner: RoadmapPriority | null) {
  if (!team && !partner) return "No priority yet";
  if (team && partner && team === partner) return "Agreed";
  if (team && partner) return "Different";
  if (team) return "Waiting on Emil";
  return "Waiting on us";
}

function whenLabel(team: RoadmapPriority | null, partner: RoadmapPriority | null) {
  const shared = team && partner && team === partner ? team : null;
  const best = shared ?? team ?? partner;
  if (!best) return null;
  return `${ROADMAP_PRIORITY_LABEL[best]} · ${ROADMAP_PRIORITY_WINDOW[best]}`;
}

export function SharedPriorityList({
  tasks,
  editableSide,
  onChangePriority,
  title = "Shared priority list",
}: {
  tasks: Task[];
  /** Which side the current viewer can edit. */
  editableSide: PrioritySide;
  onChangePriority: (
    taskId: string,
    side: PrioritySide,
    value: RoadmapPriority | null,
  ) => Promise<void> | void;
  title?: string;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "aligned" | "split" | "open">("all");

  const rows = useMemo(() => {
    const withRoadmap = tasks.filter(
      (t) =>
        !t.parent_id &&
        t.status !== "done" &&
        (normalizeRoadmapPriority(t.team_priority) ||
          normalizeRoadmapPriority(t.partner_priority) ||
          /^\[Roadmap\]/i.test(t.title)),
    );
    const sorted = [...withRoadmap].sort((a, b) => {
      const aTeam = normalizeRoadmapPriority(a.team_priority);
      const bTeam = normalizeRoadmapPriority(b.team_priority);
      const aPartner = normalizeRoadmapPriority(a.partner_priority);
      const bPartner = normalizeRoadmapPriority(b.partner_priority);
      const aShared =
        aTeam && aPartner && aTeam === aPartner ? roadmapSortKey(aTeam) : 50;
      const bShared =
        bTeam && bPartner && bTeam === bPartner ? roadmapSortKey(bTeam) : 50;
      if (aShared !== bShared) return aShared - bShared;
      const aBest = Math.min(roadmapSortKey(aTeam), roadmapSortKey(aPartner));
      const bBest = Math.min(roadmapSortKey(bTeam), roadmapSortKey(bPartner));
      if (aBest !== bBest) return aBest - bBest;
      return a.title.localeCompare(b.title);
    });
    return sorted.filter((t) => {
      const team = normalizeRoadmapPriority(t.team_priority);
      const partner = normalizeRoadmapPriority(t.partner_priority);
      if (filter === "aligned") return Boolean(team && partner && team === partner);
      if (filter === "split") return Boolean(team && partner && team !== partner);
      if (filter === "open") return !partner || !team;
      return true;
    });
  }, [tasks, filter]);

  async function setPriority(task: Task, side: PrioritySide, value: RoadmapPriority | null) {
    if (side !== editableSide) return;
    setSavingId(task.id);
    try {
      await onChangePriority(task.id, side, value);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/50">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-neutral-200">{title}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            We and Emil each set a priority. If Emil has not rated yet, it shows “Waiting on Emil”.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {ROADMAP_PRIORITIES.map((level) => (
              <span
                key={level}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950/80 px-2 py-1 text-[11px] text-neutral-300"
              >
                <span className="font-medium text-neutral-100">
                  {ROADMAP_PRIORITY_LABEL[level]}
                </span>
                <span className="text-neutral-500">{ROADMAP_PRIORITY_WINDOW[level]}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All"],
              ["aligned", "Agreed"],
              ["split", "Different"],
              ["open", "Waiting"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-md px-2.5 py-1 text-[11px] border ${
                filter === id
                  ? "border-[#d4e052]/40 bg-[#d4e052]/10 text-[#d4e052]"
                  : "border-neutral-800 text-neutral-500 hover:border-neutral-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-neutral-600">
          No roadmap items with P1–P3 yet.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800/80">
          {rows.map((task) => {
            const team = normalizeRoadmapPriority(task.team_priority);
            const partner = normalizeRoadmapPriority(task.partner_priority);
            const align = alignmentLabel(team, partner);
            const title = task.title.replace(/^\[Roadmap\]\s*/i, "");
            return (
              <li key={task.id} className="px-4 py-3 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-neutral-100 truncate">{title}</p>
                    {whenLabel(team, partner) && (
                      <p className="text-[11px] text-[#d4e052]/80 mt-0.5">
                        When: {whenLabel(team, partner)}
                      </p>
                    )}
                    {task.description && (
                      <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-[11px] px-2 py-0.5 rounded border ${
                      align === "Agreed"
                        ? "border-[#d4e052]/40 text-[#d4e052]"
                        : align === "Different"
                          ? "border-amber-400/40 text-amber-300"
                          : "border-neutral-700 text-neutral-500"
                    }`}
                  >
                    {align}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <PriorityChips
                    label="Ours"
                    value={team}
                    disabled={editableSide !== "team" || savingId === task.id}
                    onChange={(next) => setPriority(task, "team", next)}
                  />
                  <PriorityChips
                    label="Emil"
                    value={partner}
                    disabled={editableSide !== "partner" || savingId === task.id}
                    onChange={(next) => setPriority(task, "partner", next)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Flag } from "lucide-react";
import type { TaskBoardSortKey } from "@/lib/task-sort";

export function TaskSortHeaderButton({
  label,
  sortKey,
  activeKey,
  sortAsc,
  onToggle,
  iconOnly,
}: {
  label: string;
  sortKey: TaskBoardSortKey;
  activeKey: TaskBoardSortKey;
  sortAsc: boolean;
  onToggle: (key: TaskBoardSortKey) => void;
  /** Compact slot (e.g. priority flag column). */
  iconOnly?: boolean;
}) {
  const active = activeKey === sortKey;
  const SortIcon = active ? (sortAsc ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      title={`Sort by ${label}${active ? (sortAsc ? " (ascending)" : " (descending)") : ""}`}
      aria-label={`Sort by ${label}`}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-sm transition-colors cursor-pointer ${
        active
          ? "text-neutral-200"
          : "text-neutral-400 hover:text-neutral-200"
      } ${iconOnly ? "justify-center w-full" : ""}`}
    >
      {iconOnly ? (
        active ? (
          <SortIcon className="w-3.5 h-3.5" />
        ) : (
          <Flag className="w-3.5 h-3.5 opacity-80" />
        )
      ) : (
        <>
          <span
            className={
              active
                ? "underline decoration-neutral-500 underline-offset-4"
                : "decoration-transparent"
            }
          >
            {label}
          </span>
          <SortIcon className={`w-3 h-3 shrink-0 ${active ? "opacity-100" : "opacity-70"}`} />
        </>
      )}
    </button>
  );
}

"use client";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PROJECT_STATUS_CHOICE_LABELS,
  PROJECT_STATUS_CHOICES,
  projectStatusChoice,
  projectStatusLabel,
  projectStatusTone,
  storedProjectStatus,
  type ProjectStatusTone,
} from "@/lib/project-status";
import type { ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<ProjectStatusTone, string> = {
  starting: "text-sky-300",
  active: "text-[#d4e052]",
  reaching_deadline: "text-amber-400",
  overdue: "text-red-400",
  on_hold: "text-neutral-400",
  completed: "text-stone-300",
  cancelled: "text-neutral-500",
};

export function ProjectStatusSelect({
  status,
  startDate,
  endDate,
  onChange,
  className,
  disabled,
}: {
  status: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  onChange: (next: ProjectStatus) => void;
  className?: string;
  disabled?: boolean;
}) {
  const value = projectStatusChoice(status, startDate, endDate);
  const label = projectStatusLabel(status, startDate, endDate);
  const tone = projectStatusTone(status, startDate, endDate);

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (!v) return;
        const next = storedProjectStatus(v as typeof value);
        if (next !== status) onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Status: ${label}`}
        title="Update status"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "h-7 w-full cursor-pointer gap-1.5 border-neutral-700/50 bg-neutral-800/50 px-2 text-xs",
          className,
        )}
      >
        <SelectValue>
          <span className={cn("truncate", TONE_CLASS[tone])}>{label}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-neutral-800 border-neutral-700">
        {PROJECT_STATUS_CHOICES.map((choice) => (
          <SelectItem key={choice} value={choice} className="text-xs">
            <span className={TONE_CLASS[choice]}>
              {PROJECT_STATUS_CHOICE_LABELS[choice]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

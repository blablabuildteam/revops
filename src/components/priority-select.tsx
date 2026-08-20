"use client";

import { Flag, AlertCircle } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type Priority = "low" | "medium" | "high" | "urgent";

export const PRIORITY_ORDER: Priority[] = ["low", "medium", "high", "urgent"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low priority",
  medium: "Medium priority",
  high: "High priority",
  urgent: "Urgent",
};

const TEXT_COLORS: Record<Priority, string> = {
  low: "text-sky-400",
  medium: "text-yellow-300",
  high: "text-orange-400",
  urgent: "text-red-400",
};

const SHORT_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

/** Menu is ordered urgent → low so the most urgent option sits at the top. */
const MENU_ORDER = [...PRIORITY_ORDER].reverse();

function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const Icon = priority === "urgent" ? AlertCircle : Flag;
  return <Icon className={`${className ?? "w-3 h-3"} ${TEXT_COLORS[priority]} shrink-0`} />;
}

export function PrioritySelect({
  priority,
  onChange,
  /** Renders just the flag icon — for narrow table columns. */
  iconOnly = false,
  className,
  disabled,
}: {
  priority: Priority;
  onChange: (next: Priority) => void;
  iconOnly?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={priority}
      onValueChange={(v) => {
        const next = (v ?? priority) as Priority;
        if (next !== priority) onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        hideIcon={iconOnly}
        aria-label={PRIORITY_LABELS[priority]}
        title={PRIORITY_LABELS[priority]}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={
          iconOnly
            ? `h-7 w-7 justify-center border-transparent bg-transparent px-0 hover:bg-neutral-800 ${className ?? ""}`
            : `h-7 w-full gap-1.5 border-neutral-700/50 bg-neutral-800/50 px-2 text-xs ${className ?? ""}`
        }
      >
        <SelectValue>
          {iconOnly ? (
            <PriorityIcon priority={priority} />
          ) : (
            <span className="flex min-w-0 items-center gap-1.5">
              <PriorityIcon priority={priority} />
              <span className={`whitespace-nowrap ${TEXT_COLORS[priority]}`}>
                {SHORT_LABELS[priority]}
              </span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-neutral-800 border-neutral-700">
        {MENU_ORDER.map((p) => (
          <SelectItem key={p} value={p} className="text-xs">
            <span className="flex items-center gap-2">
              <PriorityIcon priority={p} />
              <span className={TEXT_COLORS[p]}>{SHORT_LABELS[p]}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

"use client";

import { Circle, Clock, CheckCircle2, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type TodoStatus = "backlog" | "open" | "in_progress" | "done";

/** Menu order mirrors the workflow: what you're doing now sits on top. */
export const TODO_STATUS_ORDER: TodoStatus[] = ["in_progress", "open", "backlog", "done"];

export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  backlog: "Backlog",
  open: "To do",
  in_progress: "In progress",
  done: "Done",
};

export const TODO_STATUS_TEXT: Record<TodoStatus, string> = {
  backlog: "text-neutral-500",
  open: "text-neutral-400",
  in_progress: "text-sky-400/90",
  done: "text-emerald-400/90",
};

export function TodoStatusIcon({
  status,
  className = "w-3.5 h-3.5",
}: {
  status: TodoStatus;
  className?: string;
}): ReactNode {
  if (status === "done") return <CheckCircle2 className={`${className} text-emerald-400/90 shrink-0`} />;
  if (status === "in_progress") return <Clock className={`${className} text-sky-400/90 shrink-0`} />;
  if (status === "backlog") return <Inbox className={`${className} text-neutral-500 shrink-0`} />;
  return <Circle className={`${className} text-neutral-500 shrink-0`} />;
}

export function TodoStatusSelect({
  status,
  onChange,
  className,
  disabled,
}: {
  status: TodoStatus;
  onChange: (next: TodoStatus) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={status}
      onValueChange={(v) => {
        const next = (v ?? status) as TodoStatus;
        if (next !== status) onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Status: ${TODO_STATUS_LABELS[status]}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={`h-7 w-[128px] shrink-0 gap-1.5 border-neutral-700/50 bg-neutral-800/50 px-2 text-xs ${className ?? ""}`}
      >
        <SelectValue>
          <span className="flex min-w-0 items-center gap-1.5">
            <TodoStatusIcon status={status} className="w-3 h-3" />
            <span className={`truncate ${TODO_STATUS_TEXT[status]}`}>
              {TODO_STATUS_LABELS[status]}
            </span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-neutral-800 border-neutral-700">
        {TODO_STATUS_ORDER.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            <span className="flex items-center gap-2">
              <TodoStatusIcon status={s} className="w-3 h-3" />
              <span className={TODO_STATUS_TEXT[s]}>{TODO_STATUS_LABELS[s]}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

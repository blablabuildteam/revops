"use client";

import { Flag, AlertCircle } from "lucide-react";

export type Priority = "low" | "medium" | "high";

const PRIORITY_ORDER: Priority[] = ["low", "medium", "high"];

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "text-neutral-600 hover:text-neutral-400",
  medium: "text-amber-400 hover:text-amber-300",
  high: "text-red-400 hover:text-red-300",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "No priority",
  medium: "Medium priority",
  high: "High priority",
};

export function PriorityFlag({
  priority,
  onChange,
  size = "sm",
}: {
  priority: Priority;
  onChange: (next: Priority) => void;
  size?: "sm" | "md";
}) {
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  function cycle(e: React.MouseEvent) {
    e.stopPropagation();
    const idx = PRIORITY_ORDER.indexOf(priority);
    const next = PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length];
    onChange(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      onPointerDown={(e) => e.stopPropagation()}
      title={PRIORITY_LABELS[priority]}
      className={`shrink-0 p-1 rounded transition-colors cursor-pointer ${PRIORITY_COLORS[priority]}`}
    >
      {priority === "high" ? (
        <AlertCircle className={iconSize} />
      ) : (
        <Flag className={iconSize} />
      )}
    </button>
  );
}

export { PRIORITY_COLORS, PRIORITY_ORDER, PRIORITY_LABELS };

import { cn } from "@/lib/utils";
import { Stage, STAGE_LABELS } from "@/lib/types";

const stageStyles: Record<Stage, string> = {
  prospect: "bg-neutral-800 text-neutral-300",
  qualified: "bg-blue-950 text-blue-300",
  proposal: "bg-violet-950 text-violet-300",
  negotiation: "bg-amber-950 text-amber-300",
  won: "bg-emerald-950 text-emerald-300",
  lost: "bg-red-950 text-red-400",
  on_hold: "bg-neutral-800 text-neutral-500",
};

interface StageBadgeProps {
  stage: Stage;
  className?: string;
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-mono",
        stageStyles[stage],
        className
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

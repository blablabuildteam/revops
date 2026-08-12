import { cn } from "@/lib/utils";
import { Stage, STAGE_LABELS } from "@/lib/types";

const stageStyles: Record<Stage, string> = {
  prospect: "bg-neutral-800 text-neutral-400",
  qualified: "bg-slate-900/80 text-slate-400",
  proposal: "bg-stone-900/80 text-stone-400",
  negotiation: "bg-[#b8c47a]/10 text-[#b8c47a]",
  won: "bg-stone-900/80 text-stone-300",
  lost: "bg-neutral-900 text-neutral-500",
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

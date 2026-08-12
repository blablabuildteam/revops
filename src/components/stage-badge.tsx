import { cn } from "@/lib/utils";
import { Stage, STAGE_LABELS } from "@/lib/types";

/** Clear but calm — enough contrast to scan, not neon rainbow. */
const stageStyles: Record<Stage, string> = {
  prospect: "bg-neutral-800 text-neutral-300",
  qualified: "bg-sky-950/70 text-sky-300/90",
  proposal: "bg-violet-950/60 text-violet-300/90",
  negotiation: "bg-[#d4e052]/10 text-[#d4e052]",
  won: "bg-emerald-950/70 text-emerald-400/90",
  lost: "bg-red-950/50 text-red-400/80",
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

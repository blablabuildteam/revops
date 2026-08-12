import { cn } from "@/lib/utils";
import { ProposalStatus, PROPOSAL_STATUS_LABELS } from "@/lib/types";

const styles: Record<ProposalStatus, string> = {
  not_sent: "text-neutral-600",
  draft: "text-neutral-400",
  sent: "text-neutral-300",
  viewed: "text-stone-300",
  accepted: "text-[#b8c47a]",
  declined: "text-neutral-500",
  expired: "text-neutral-500",
};

interface ProposalBadgeProps {
  status?: ProposalStatus;
  className?: string;
}

export function ProposalBadge({ status, className }: ProposalBadgeProps) {
  if (!status) return <span className="text-neutral-700 text-xs">—</span>;
  return (
    <span className={cn("text-xs font-mono", styles[status], className)}>
      {PROPOSAL_STATUS_LABELS[status]}
    </span>
  );
}

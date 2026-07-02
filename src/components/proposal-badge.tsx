import { cn } from "@/lib/utils";
import { ProposalStatus, PROPOSAL_STATUS_LABELS } from "@/lib/types";

const styles: Record<ProposalStatus, string> = {
  not_sent: "text-neutral-600",
  draft: "text-neutral-400",
  sent: "text-blue-400",
  viewed: "text-violet-400",
  accepted: "text-emerald-400",
  declined: "text-red-400",
  expired: "text-orange-400",
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

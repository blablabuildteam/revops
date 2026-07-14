"use client";

import { ExternalLink } from "lucide-react";
import { SentimentIndicator } from "@/components/sentiment-indicator";
import { ProposalBadge } from "@/components/proposal-badge";
import { Opportunity, Stage, STAGE_LABELS } from "@/lib/types";
import { formatCurrency, formatRelativeDate } from "@/lib/format";

const PIPELINE_STAGES: Stage[] = [
  "prospect",
  "qualified",
  "proposal",
  "negotiation",
  "won",
];

const stageAccent: Record<string, string> = {
  prospect: "border-neutral-700",
  qualified: "border-blue-800",
  proposal: "border-violet-800",
  negotiation: "border-[#e8ff47]/40",
  won: "border-emerald-800",
};

const stageHeader: Record<string, string> = {
  prospect: "text-neutral-400",
  qualified: "text-blue-400",
  proposal: "text-violet-400",
  negotiation: "text-[#e8ff47]",
  won: "text-emerald-400",
};

function OpportunityCard({
  opp,
  onEdit,
  onStageChange,
  onActivate,
  showActivate,
}: {
  opp: Opportunity;
  onEdit: (opp: Opportunity) => void;
  onStageChange: (id: string, stage: Stage) => void;
  onActivate?: (opp: Opportunity, e: React.MouseEvent) => void;
  showActivate?: boolean;
}) {
  return (
    <div
      className="bg-neutral-900 border border-neutral-800 rounded-lg p-3.5 space-y-2.5 cursor-pointer hover:border-neutral-700 transition-colors group"
      onClick={() => onEdit(opp)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-200 truncate leading-tight">
            {opp.name}
          </p>
          <p className="text-xs text-neutral-600 truncate mt-0.5">
            {opp.company?.name || "—"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {showActivate && onActivate && (
            <button
              onClick={(e) => onActivate(opp, e)}
              title="Activate deal"
              className="p-1 text-lg hover:bg-neutral-800 rounded transition-colors"
            >
              🚀
            </button>
          )}
          <SentimentIndicator sentiment={opp.sentiment} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-mono font-semibold text-[#e8ff47]">
            {formatCurrency(opp.expected_value)}
          </p>
          <p className="text-xs text-neutral-600 font-mono">
            {opp.probability}% chance ·{" "}
            <span className="text-neutral-500">
              {formatCurrency(opp.weighted_value)} wt.
            </span>
            <span className="text-neutral-700"> · excl. VAT</span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-neutral-800">
        <ProposalBadge status={opp.proposal_status} />
        <div className="flex items-center gap-2">
          {opp.proposal_url && (
            <a
              href={opp.proposal_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <p className="text-xs text-neutral-700 font-mono">
            {formatRelativeDate(opp.close_date)}
          </p>
        </div>
      </div>

      <div
        className="hidden group-hover:flex gap-1 pt-1 border-t border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        {PIPELINE_STAGES.filter((s) => s !== opp.stage).map((s) => (
          <button
            key={s}
            onClick={() => onStageChange(opp.id, s)}
            className="text-xs text-neutral-600 hover:text-neutral-300 px-1.5 py-0.5 rounded hover:bg-neutral-800 transition-colors font-mono"
          >
            → {STAGE_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OpportunityPipelineView({
  opps,
  loading,
  activatedOpportunityIds,
  onEdit,
  onStageChange,
  onActivate,
}: {
  opps: Opportunity[];
  loading: boolean;
  activatedOpportunityIds: Set<string>;
  onEdit: (opp: Opportunity) => void;
  onStageChange: (id: string, stage: Stage) => void;
  onActivate?: (opp: Opportunity, e: React.MouseEvent) => void;
}) {
  const stageTotal = (stage: Stage) =>
    opps
      .filter((o) => o.stage === stage)
      .reduce((s, o) => s + (Number(o.expected_value) || 0), 0);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PIPELINE_STAGES.map((stage) => {
        const stageOpps = opps.filter((o) => o.stage === stage);
        return (
          <div
            key={stage}
            className={`shrink-0 w-72 border-t-2 ${stageAccent[stage]} bg-neutral-900/30 rounded-lg`}
          >
            <div className="px-3.5 py-3 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <p
                  className={`text-xs font-semibold uppercase tracking-widest ${stageHeader[stage]}`}
                >
                  {STAGE_LABELS[stage]}
                </p>
                <p className="text-xs text-neutral-600 font-mono mt-0.5">
            {formatCurrency(stageTotal(stage))} excl. VAT · {stageOpps.length}{" "}
            opportunities
          </p>
              </div>
            </div>

            <div className="p-3 space-y-2.5 min-h-32">
              {loading
                ? [...Array(2)].map((_, i) => (
                    <div
                      key={i}
                      className="bg-neutral-900 border border-neutral-800 rounded-lg h-24 animate-pulse"
                    />
                  ))
                : stageOpps.map((opp) => (
                    <OpportunityCard
                      key={opp.id}
                      opp={opp}
                      onEdit={onEdit}
                      onStageChange={onStageChange}
                      onActivate={onActivate}
                      showActivate={
                        opp.stage === "won" && !activatedOpportunityIds.has(opp.id)
                      }
                    />
                  ))}
              {!loading && stageOpps.length === 0 && (
                <p className="text-xs text-neutral-700 text-center py-6">
                  No opportunities
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

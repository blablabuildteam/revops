"use client";

import { useEffect, useState } from "react";
import { Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SentimentIndicator } from "@/components/sentiment-indicator";
import { ProposalBadge } from "@/components/proposal-badge";
import { OpportunityForm } from "@/components/opportunity-form";
import { getOpportunities, updateOpportunity } from "@/lib/api";
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
}: {
  opp: Opportunity;
  onEdit: (opp: Opportunity) => void;
  onStageChange: (id: string, stage: Stage) => void;
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
        <SentimentIndicator sentiment={opp.sentiment} />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-mono font-semibold text-[#e8ff47]">
            {formatCurrency(opp.expected_value)}
          </p>
          <p className="text-xs text-neutral-600 font-mono">
            {opp.probability}% kans ·{" "}
            <span className="text-neutral-500">
              {formatCurrency(opp.weighted_value)}
            </span>
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

      {/* Quick stage move buttons */}
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

export default function PipelinePage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);

  async function load() {
    setLoading(true);
    const data = await getOpportunities();
    setOpps(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleStageChange(id: string, stage: Stage) {
    const probMap: Record<Stage, number> = {
      prospect: 20,
      qualified: 40,
      proposal: 60,
      negotiation: 80,
      won: 100,
      lost: 0,
      on_hold: 25,
    };
    const updated = await updateOpportunity(id, {
      stage,
      probability: probMap[stage],
    });
    setOpps((prev) => prev.map((o) => (o.id === id ? updated : o)));
  }

  function handleEdit(opp: Opportunity) {
    setEditingOpp(opp);
    setFormOpen(true);
  }

  const stageTotal = (stage: Stage) =>
    opps
      .filter((o) => o.stage === stage)
      .reduce((s, o) => s + o.expected_value, 0);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Pipeline</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Klik op een kaart om te bewerken · hover voor snelle faseverandering
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingOpp(null);
            setFormOpen(true);
          }}
          className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2"
        >
          <Plus className="w-4 h-4" />
          Nieuwe kans
        </Button>
      </div>

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
                  <p className={`text-xs font-semibold uppercase tracking-widest ${stageHeader[stage]}`}>
                    {STAGE_LABELS[stage]}
                  </p>
                  <p className="text-xs text-neutral-600 font-mono mt-0.5">
                    {formatCurrency(stageTotal(stage))} · {stageOpps.length} kansen
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
                        onEdit={handleEdit}
                        onStageChange={handleStageChange}
                      />
                    ))}
                {!loading && stageOpps.length === 0 && (
                  <p className="text-xs text-neutral-700 text-center py-6">
                    Geen kansen
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <OpportunityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingOpp(null);
        }}
        initial={editingOpp}
        onSave={(opp) => {
          setOpps((prev) => {
            const exists = prev.find((o) => o.id === opp.id);
            if (exists) return prev.map((o) => (o.id === opp.id ? opp : o));
            return [opp, ...prev];
          });
        }}
      />
    </div>
  );
}

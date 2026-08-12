"use client";

export const dynamic = "force-dynamic";

import { useCallback, useState } from "react";
import { useProjects, useOpportunities, useFinanceDeals } from "@/hooks/use-api-data";
import { CapacityBezetting } from "./capacity-bezetting";
import { DealLoadPanel } from "../allocation/deal-load-panel";
import { TARGET_HOURLY_RATE } from "@/lib/deal-capacity";
import { cn } from "@/lib/utils";

export default function CapacityPage() {
  const [tab, setTab] = useState<"bezetting" | "klussen">("bezetting");
  const { data: projects = [], isLoading: projectsLoading, mutate: mutateProjects } =
    useProjects();
  const { data: opportunities = [], isLoading: oppsLoading, mutate: mutateOpps } =
    useOpportunities();
  const { data: deals = [], isLoading: dealsLoading, mutate: mutateDeals } =
    useFinanceDeals();

  const refresh = useCallback(() => {
    void mutateDeals();
    void mutateOpps();
    void mutateProjects();
  }, [mutateDeals, mutateOpps, mutateProjects]);

  const loading =
    (projectsLoading && projects.length === 0) ||
    (oppsLoading && opportunities.length === 0) ||
    (dealsLoading && deals.length === 0);

  if (loading) {
    return (
      <div className="page-shell space-y-6">
        <div className="h-8 w-40 bg-neutral-900/60 rounded animate-pulse" />
        <div className="h-64 bg-neutral-900/30 border border-neutral-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="page-shell space-y-5 sm:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-neutral-100">Capacity</h1>
          <p className="text-[13px] sm:text-sm text-neutral-500 mt-0.5">
            Fee ÷ €{TARGET_HOURLY_RATE}/u tot de deadline · actual deals, optioneel pipeline
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-neutral-800">
        {(
          [
            { id: "bezetting" as const, label: "Bezetting" },
            { id: "klussen" as const, label: "Klussen" },
          ] as const
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? "page" : undefined}
            className={cn(
              "relative px-3 py-2 text-sm transition-colors -mb-px border-b-2",
              tab === entry.id
                ? "text-[#d4e052] border-[#d4e052]"
                : "text-neutral-500 border-transparent hover:text-neutral-200",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "bezetting" ? (
        <CapacityBezetting
          deals={deals}
          projects={projects}
          opportunities={opportunities}
        />
      ) : (
        <DealLoadPanel
          deals={deals}
          projects={projects}
          opportunities={opportunities}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}

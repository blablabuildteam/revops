"use client";

export const dynamic = "force-dynamic";

import { useMemo, useCallback } from "react";
import { Users } from "lucide-react";
import { useProjects, useOpportunities, useFinanceDeals } from "@/hooks/use-api-data";
import { DealLoadPanel } from "./deal-load-panel";
import { WeeklyLoadPanel } from "./weekly-load-panel";
import { buildDealLoadRows, TARGET_HOURLY_RATE } from "@/lib/deal-capacity";

export default function AllocationPage() {
  const { data: projects = [], isLoading: projectsLoading, mutate: mutateProjects } =
    useProjects();
  const { data: opportunities = [], isLoading: oppsLoading, mutate: mutateOpps } =
    useOpportunities();
  const { data: deals = [], mutate: mutateDeals } = useFinanceDeals();

  const refreshCapacity = useCallback(() => {
    void mutateDeals();
    void mutateOpps();
    void mutateProjects();
  }, [mutateDeals, mutateOpps, mutateProjects]);

  const rows = useMemo(
    () => buildDealLoadRows({ deals, projects, opportunities }),
    [deals, projects, opportunities],
  );

  const loading =
    (projectsLoading && projects.length === 0) ||
    (oppsLoading && opportunities.length === 0);

  if (loading) {
    return (
      <div className="p-6 max-w-full space-y-4">
        <div className="h-8 w-48 bg-neutral-900 border border-neutral-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse"
            />
          ))}
        </div>
        <div className="h-64 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full space-y-8">
      <div className="flex items-center gap-3">
        <Users className="w-6 h-6 text-[#d4e052]" />
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Capacity</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Fee ÷ €{TARGET_HOURLY_RATE}/h, spread evenly until each deadline — weekly view of how
            full the team is
          </p>
        </div>
      </div>

      <DealLoadPanel
        deals={deals}
        projects={projects}
        opportunities={opportunities}
        onRefresh={refreshCapacity}
      />

      <WeeklyLoadPanel
        deals={deals}
        projects={projects}
        opportunities={opportunities}
        rows={rows}
      />
    </div>
  );
}

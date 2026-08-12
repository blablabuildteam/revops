"use client";

export const dynamic = "force-dynamic";

import { useProjects, useOpportunities, useFinanceDeals } from "@/hooks/use-api-data";
import { CapacityBezetting } from "./capacity-bezetting";

export default function CapacityPage() {
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: opportunities = [], isLoading: oppsLoading } = useOpportunities();
  const { data: deals = [], isLoading: dealsLoading } = useFinanceDeals();

  const loading =
    (projectsLoading && projects.length === 0) ||
    (oppsLoading && opportunities.length === 0) ||
    (dealsLoading && deals.length === 0);

  if (loading) {
    return (
      <div className="px-8 py-10 max-w-6xl mx-auto space-y-10">
        <div className="h-10 w-48 bg-neutral-900/60 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-neutral-900/40 rounded animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-neutral-900/30 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-8 py-10">
      <CapacityBezetting
        deals={deals}
        projects={projects}
        opportunities={opportunities}
      />
    </div>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { useCallback } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useProjects, useOpportunities, useFinanceDeals } from "@/hooks/use-api-data";
import { DealLoadPanel } from "./deal-load-panel";
import { TARGET_HOURLY_RATE } from "@/lib/deal-capacity";

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

  const loading =
    (projectsLoading && projects.length === 0) ||
    (oppsLoading && opportunities.length === 0);

  if (loading) {
    return (
      <div className="px-8 py-10 max-w-6xl mx-auto space-y-6">
        <div className="h-8 w-56 bg-neutral-900/60 rounded animate-pulse" />
        <div className="h-64 bg-neutral-900/30 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-8 py-10 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-600">
            Capacity · €{TARGET_HOURLY_RATE}/h
          </p>
          <h1 className="text-3xl font-semibold text-neutral-100 tracking-tight">
            Klussen
          </h1>
          <p className="text-sm text-neutral-500 max-w-lg leading-relaxed">
            Fee, deadline en tempo per lopende deal. Bezetting over weken/maanden staat apart.
          </p>
        </div>
        <Link
          href="/capacity"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-[#d4e052] transition-colors"
        >
          Naar bezetting
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      <DealLoadPanel
        deals={deals}
        projects={projects}
        opportunities={opportunities}
        onRefresh={refreshCapacity}
      />
    </div>
  );
}

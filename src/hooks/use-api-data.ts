"use client";

import { useCallback, useRef } from "react";
import { useCachedQuery } from "@/hooks/use-cached-query";
import {
  getCompanies,
  getFinanceDeals,
  getFinanceSummary,
  getOpportunities,
  getProjects,
  getUsers,
  type ApiUser,
  type ProjectWithStats,
} from "@/lib/api";
import { cacheKeys } from "@/lib/query-cache";
import type { Company, FinanceDeal, Opportunity } from "@/lib/types";

export function useOpportunities() {
  return useCachedQuery<Opportunity[]>(cacheKeys.opportunities, getOpportunities);
}

export function useCompanies() {
  return useCachedQuery<Company[]>(cacheKeys.companies, getCompanies);
}

export function useProjects() {
  return useCachedQuery<ProjectWithStats[]>(cacheKeys.projects, getProjects);
}

export function useUsers() {
  return useCachedQuery<ApiUser[]>(cacheKeys.users, getUsers);
}

function useStableFinanceDealsFetcher(opportunityId?: string) {
  const ref = useRef(opportunityId);
  ref.current = opportunityId;
  return useCallback(() => getFinanceDeals(ref.current), []);
}

export function useFinanceDeals(opportunityId?: string) {
  const key = cacheKeys.financeDeals(opportunityId);
  const fetcher = useStableFinanceDealsFetcher(opportunityId);
  return useCachedQuery<FinanceDeal[]>(key, fetcher);
}

function useStableFinanceSummaryFetcher(month: string) {
  const ref = useRef(month);
  ref.current = month;
  return useCallback(() => getFinanceSummary(ref.current), []);
}

export function useFinanceSummary<T = unknown>(month: string) {
  const fetcher = useStableFinanceSummaryFetcher(month);
  return useCachedQuery<T>(cacheKeys.financeSummary(month), fetcher as () => Promise<T>);
}

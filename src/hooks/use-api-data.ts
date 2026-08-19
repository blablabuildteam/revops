"use client";

import { useCallback, useRef } from "react";
import { useCachedQuery } from "@/hooks/use-cached-query";
import {
  getAllocations,
  getBunqPots,
  getBunqTotals,
  getCompanies,
  getFinanceDeals,
  getFinanceSummary,
  getOpportunities,
  getProjects,
  getSlaAgreements,
  getTaxSettings,
  getUsers,
  type ApiUser,
  type BunqPots,
  type BunqPaymentTotals,
  type ProjectWithStats,
} from "@/lib/api";
import { cacheKeys } from "@/lib/query-cache";
import type { TaxSettings } from "@/lib/tax-settings";
import type { Allocation, Company, FinanceDeal, Opportunity, SlaAgreement } from "@/lib/types";

export function useOpportunities() {
  return useCachedQuery<Opportunity[]>(cacheKeys.opportunities, getOpportunities);
}

export function useCompanies() {
  return useCachedQuery<Company[]>(cacheKeys.companies, getCompanies);
}

export function useSlaAgreements() {
  return useCachedQuery<SlaAgreement[]>(cacheKeys.slaAgreements, getSlaAgreements);
}

export function useProjects() {
  return useCachedQuery<ProjectWithStats[]>(cacheKeys.projects, getProjects);
}

export function useAllocations() {
  return useCachedQuery<Allocation[]>(cacheKeys.allocations, getAllocations);
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

export function useTaxSettings() {
  return useCachedQuery<TaxSettings>(cacheKeys.taxSettings, getTaxSettings);
}

export function useBunqTotals() {
  return useCachedQuery<BunqPaymentTotals>(cacheKeys.bunqTotals, getBunqTotals);
}

export function useBunqPots() {
  return useCachedQuery<BunqPots>(cacheKeys.bunqAccounts, getBunqPots);
}

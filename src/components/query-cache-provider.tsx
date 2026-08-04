"use client";

import { useRef, type ReactNode } from "react";
import type { ApiUser, ProjectWithStats } from "@/lib/api";
import { cacheKeys, setCached } from "@/lib/query-cache";
import type { Company, Opportunity } from "@/lib/types";

export type QueryCacheSeed = {
  companies: Company[];
  projects: ProjectWithStats[];
  users: ApiUser[];
  opportunities: Opportunity[];
};

type QueryCacheProviderProps = {
  seed?: QueryCacheSeed | null;
  children: ReactNode;
};

/**
 * Seeds the in-memory query cache during render (SSR + first client paint)
 * so child hooks/fetches resolve immediately without a network round-trip.
 */
export function QueryCacheProvider({ seed, children }: QueryCacheProviderProps) {
  const seeded = useRef(false);

  if (!seeded.current && seed) {
    setCached(cacheKeys.companies, seed.companies);
    setCached(cacheKeys.projects, seed.projects);
    setCached(cacheKeys.users, seed.users);
    setCached(cacheKeys.opportunities, seed.opportunities);
    seeded.current = true;
  }

  return children;
}

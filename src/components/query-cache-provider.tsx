"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
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

function applySeed(seed: QueryCacheSeed) {
  setCached(cacheKeys.companies, seed.companies);
  setCached(cacheKeys.projects, seed.projects);
  setCached(cacheKeys.users, seed.users);
  setCached(cacheKeys.opportunities, seed.opportunities);
}

/**
 * Seeds the in-memory query cache during render (SSR + first client paint)
 * so child hooks/fetches resolve immediately without a network round-trip.
 */
export function QueryCacheProvider({ seed, children }: QueryCacheProviderProps) {
  const seeded = useRef(false);

  if (!seeded.current && seed) {
    applySeed(seed);
    seeded.current = true;
  }

  return children;
}

/**
 * Standalone seeder so the layout can stream list data in after the shell has
 * already painted, instead of blocking first render on those queries.
 *
 * Must write after commit. This component is a sibling of the page, so a
 * render-time setCached() would notify subscribed pages mid-render.
 */
export function QueryCacheSeed({ seed }: { seed: QueryCacheSeed }) {
  const seeded = useRef(false);

  useLayoutEffect(() => {
    if (seeded.current) return;
    applySeed(seed);
    seeded.current = true;
  }, [seed]);

  return null;
}

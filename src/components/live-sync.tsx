"use client";

import { useEffect, useRef } from "react";
import { getFinanceDeals, getOpportunities, getProjects } from "@/lib/api";
import {
  shouldSkipIncoming,
  startLiveSyncPoll,
  type LiveSyncSnapshot,
} from "@/lib/live-sync";
import { useMutationFeedback } from "@/components/mutation-provider";
import { cacheKeys, refreshCache, refreshCachePrefix } from "@/lib/query-cache";

/**
 * Polls a cheap revision endpoint (same pattern as the workshop board)
 * and force-refreshes shared list caches when another session writes.
 */
export function LiveSync() {
  const { pendingCount } = useMutationFeedback();
  const pendingRef = useRef(pendingCount);
  pendingRef.current = pendingCount;
  const lastRef = useRef<LiveSyncSnapshot | null>(null);

  useEffect(() => {
    return startLiveSyncPoll({
      shouldSkip: () => pendingRef.current > 0 || shouldSkipIncoming(),
      onSnapshot: (snapshot, { initial }) => {
        const prev = lastRef.current;
        lastRef.current = snapshot;
        if (initial || !prev) {
          // Register fetchers. Force-refresh only when a hook already primed the cache
          // so we catch writes that landed between SSR seed and this first poll.
          void getOpportunities();
          void getProjects();
          void getFinanceDeals();
          refreshCache(
            cacheKeys.opportunities,
            cacheKeys.financeDeals(),
            cacheKeys.projects,
          );
          refreshCachePrefix("project:");
          return;
        }

        if (prev.opportunities !== snapshot.opportunities) {
          refreshCache(cacheKeys.opportunities, cacheKeys.financeDeals());
        }
        if (prev.projects !== snapshot.projects) {
          refreshCache(cacheKeys.projects);
          refreshCachePrefix("project:");
        }
      },
    });
  }, []);

  return null;
}

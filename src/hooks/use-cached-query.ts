"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getCached,
  subscribe,
  invalidateCache,
} from "@/lib/query-cache";

/**
 * Subscribe to a cache key. The fetcher should already use `cachedFetch`
 * (e.g. getOpportunities) so we don't nest cache layers.
 */
export function useCachedQuery<T>(key: string, fetcher: () => Promise<T>) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const cached = useSyncExternalStore(
    (onStoreChange) => subscribe<T>(key, () => onStoreChange()),
    () => getCached<T>(key),
    () => undefined
  );

  const [isLoading, setIsLoading] = useState(() => getCached<T>(key) === undefined);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(getCached<T>(key) === undefined);
    setIsValidating(true);
    fetcherRef
      .current()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setIsValidating(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const mutate = useCallback(async () => {
    invalidateCache(key);
    setIsValidating(true);
    setError(null);
    try {
      await fetcherRef.current();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  }, [key]);

  return {
    data: cached,
    isLoading,
    isValidating,
    error,
    mutate,
  };
}

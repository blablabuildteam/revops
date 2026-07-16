type CacheEntry<T> = {
  data?: T;
  fetchedAt: number;
  promise?: Promise<T>;
  fetcher?: () => Promise<T>;
};

const store = new Map<string, CacheEntry<unknown>>();
const listeners = new Map<string, Set<(data: unknown) => void>>();

/** Data older than this is served immediately but refreshed in the background. */
export const STALE_MS = 30_000;

function getEntry<T>(key: string): CacheEntry<T> | undefined {
  return store.get(key) as CacheEntry<T> | undefined;
}

function notify<T>(key: string, data: T) {
  const set = listeners.get(key);
  if (!set) return;
  for (const fn of set) fn(data);
}

export function getCached<T>(key: string): T | undefined {
  return getEntry<T>(key)?.data;
}

export function setCached<T>(key: string, data: T) {
  const prev = getEntry<T>(key);
  store.set(key, {
    data,
    fetchedAt: Date.now(),
    promise: undefined,
    fetcher: prev?.fetcher,
  });
  notify(key, data);
}

export function subscribe<T>(key: string, fn: (data: T) => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  const wrapped = fn as (data: unknown) => void;
  set.add(wrapped);
  return () => {
    set!.delete(wrapped);
    if (set!.size === 0) listeners.delete(key);
  };
}

export function invalidateCache(...keys: string[]) {
  for (const key of keys) {
    const entry = getEntry(key);
    const fetcher = entry?.fetcher;
    store.delete(key);
    // Active subscribers should refresh immediately after invalidation
    if (fetcher && (listeners.get(key)?.size ?? 0) > 0) {
      void cachedFetch(key, fetcher, { force: true });
    }
  }
}

export function invalidateCachePrefix(prefix: string) {
  const keys = [...store.keys()].filter((key) => key.startsWith(prefix));
  if (keys.length) invalidateCache(...keys);
}

/**
 * Stale-while-revalidate fetch.
 * - Cache miss: await network
 * - Cache hit: resolve immediately; refresh in background if stale (or force)
 */
export function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { force?: boolean }
): Promise<T> {
  const entry = getEntry<T>(key);
  const now = Date.now();
  const hasData = entry?.data !== undefined;
  const isStale = !hasData || now - (entry?.fetchedAt ?? 0) > STALE_MS;

  if (hasData && !opts?.force) {
    if (isStale && !entry?.promise) {
      const promise = fetcher()
        .then((data) => {
          store.set(key, { data, fetchedAt: Date.now(), fetcher });
          notify(key, data);
          return data;
        })
        .finally(() => {
          const current = getEntry<T>(key);
          if (current?.promise === promise) {
            store.set(key, { ...current, promise: undefined });
          }
        });
      store.set(key, { ...entry!, fetcher, promise });
    } else if (entry) {
      entry.fetcher = fetcher;
    }
    return Promise.resolve(entry!.data as T);
  }

  if (entry?.promise && !opts?.force) {
    return entry.promise;
  }

  const promise = fetcher()
    .then((data) => {
      store.set(key, { data, fetchedAt: Date.now(), fetcher });
      notify(key, data);
      return data;
    })
    .finally(() => {
      const current = getEntry<T>(key);
      if (current?.promise === promise) {
        store.set(key, { ...current, promise: undefined });
      }
    });

  store.set(key, {
    data: entry?.data,
    fetchedAt: entry?.fetchedAt ?? 0,
    fetcher,
    promise,
  });

  return promise;
}

export const cacheKeys = {
  opportunities: "opportunities",
  companies: "companies",
  projects: "projects",
  users: "users",
  financeDeals: (opportunityId?: string) =>
    opportunityId ? `finance-deals:${opportunityId}` : "finance-deals",
  financeSummary: (month: string) => `finance-summary:${month}`,
} as const;

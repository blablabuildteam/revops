export const LIVE_SYNC_POLL_MS = 2000;

export type LiveSyncSnapshot = {
  opportunities: string;
  projects: string;
};

export function fingerprint(count: unknown, updated: unknown): string {
  return `${count ?? 0}:${updated ?? 0}`;
}

export function joinFingerprints(...parts: string[]): string {
  return parts.join("|");
}

let holdUntil = 0;

/** Pause applying remote snapshots while a local drag/write is in flight. */
export function holdLiveSync(ms = 2000) {
  if (typeof window === "undefined") return;
  holdUntil = Math.max(holdUntil, Date.now() + ms);
}

export function isEditingTextField(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function shouldSkipIncoming(): boolean {
  if (typeof document === "undefined") return true;
  if (document.hidden) return true;
  if (Date.now() < holdUntil) return true;
  if (isEditingTextField()) return true;
  if (
    document.querySelector(
      '[data-slot="select-trigger"][aria-expanded="true"], [data-slot="select-content"][data-open], [role="listbox"][data-open]',
    )
  ) {
    return true;
  }
  return false;
}

export async function fetchLiveSyncSnapshot(opts?: {
  signal?: AbortSignal;
}): Promise<LiveSyncSnapshot> {
  const res = await fetch("/api/sync", {
    cache: "no-store",
    signal: opts?.signal,
  });
  if (!res.ok) {
    throw new Error(`Live sync failed (${res.status})`);
  }
  return (await res.json()) as LiveSyncSnapshot;
}

export function startLiveSyncPoll(opts: {
  shouldSkip?: () => boolean;
  onSnapshot: (snapshot: LiveSyncSnapshot, meta: { initial: boolean }) => void;
  intervalMs?: number;
}): () => void {
  const intervalMs = opts.intervalMs ?? LIVE_SYNC_POLL_MS;
  let cancelled = false;
  let inFlight = false;
  let started = false;

  const tick = async () => {
    if (cancelled || inFlight) return;
    if (document.hidden) return;
    if (opts.shouldSkip?.()) return;
    inFlight = true;
    try {
      const snapshot = await fetchLiveSyncSnapshot();
      if (cancelled) return;
      if (opts.shouldSkip?.()) return;
      const initial = !started;
      started = true;
      opts.onSnapshot(snapshot, { initial });
    } catch {
      /* ignore poll errors */
    } finally {
      inFlight = false;
    }
  };

  void tick();
  const id = window.setInterval(() => {
    void tick();
  }, intervalMs);
  const onVis = () => {
    if (!document.hidden) void tick();
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    cancelled = true;
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVis);
  };
}

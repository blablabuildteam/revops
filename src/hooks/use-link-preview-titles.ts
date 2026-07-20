"use client";

import { useEffect, useState } from "react";
import { classifyLink } from "@/lib/linkify";

const memoryCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

async function fetchTitle(href: string): Promise<string | null> {
  if (memoryCache.has(href)) return memoryCache.get(href) ?? null;
  const existing = inflight.get(href);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(href)}`);
      if (!res.ok) {
        memoryCache.set(href, null);
        return null;
      }
      const data = (await res.json()) as { title?: string | null };
      const title = data.title?.trim() || null;
      memoryCache.set(href, title);
      return title;
    } catch {
      memoryCache.set(href, null);
      return null;
    } finally {
      inflight.delete(href);
    }
  })();

  inflight.set(href, promise);
  return promise;
}

/** Resolve Google Workspace titles for the given hrefs (best-effort, cached). */
export function useLinkPreviewTitles(hrefs: string[]): Record<string, string> {
  const [titles, setTitles] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const href of hrefs) {
      const cached = memoryCache.get(href);
      if (cached) initial[href] = cached;
    }
    return initial;
  });

  const key = hrefs.slice().sort().join("\0");

  useEffect(() => {
    const googleHrefs = hrefs.filter((href) => classifyLink(href) !== "generic");
    if (googleHrefs.length === 0) return;

    let cancelled = false;

    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        googleHrefs.map(async (href) => {
          const title = await fetchTitle(href);
          if (title) next[href] = title;
        }),
      );
      if (!cancelled && Object.keys(next).length > 0) {
        setTitles((prev) => ({ ...prev, ...next }));
      }
    })();

    return () => {
      cancelled = true;
    };
    // key captures href set membership
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return titles;
}

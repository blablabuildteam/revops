import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth";
import { classifyLink } from "@/lib/linkify";
import { fetchLinkPreviewTitle } from "@/lib/link-preview";

type CacheEntry = { title: string | null; expires: number };

const cache = new Map<string, CacheEntry>();
const TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const MAX_CACHE = 500;

function getCached(url: string): string | null | undefined {
  const hit = cache.get(url);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(url);
    return undefined;
  }
  return hit.title;
}

function setCached(url: string, title: string | null) {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(url, { title, expires: Date.now() + TTL_MS });
}

export async function GET(req: NextRequest) {
  const user = await resolveSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get("url")?.trim();
  if (!raw) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let href: string;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }
    href = parsed.href;
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  const kind = classifyLink(href);
  if (kind === "generic") {
    return NextResponse.json({ title: null, kind });
  }

  const cached = getCached(href);
  if (cached !== undefined) {
    return NextResponse.json({ title: cached, kind, cached: true });
  }

  const title = await fetchLinkPreviewTitle(href);
  setCached(href, title);
  return NextResponse.json({ title, kind, cached: false });
}

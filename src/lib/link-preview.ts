import { classifyLink, type LinkKind } from "@/lib/linkify";

const TITLE_SUFFIX_RE =
  /\s*[-–—|]\s*Google\s+(Docs?|Documenten|Sheets?|Spreadsheets?|Slides?|Presentaties?|Drive)\s*$/i;

export function extractGoogleFileId(href: string): string | null {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "docs.google.com") {
      const m = url.pathname.match(
        /^\/(document|spreadsheets|presentation)\/d\/([^/]+)/,
      );
      return m?.[2] ?? null;
    }
    if (host === "drive.google.com") {
      const m = url.pathname.match(/^\/file\/d\/([^/]+)/);
      if (m?.[1]) return m[1];
      return url.searchParams.get("id");
    }
  } catch {
    return null;
  }
  return null;
}

export function cleanPreviewTitle(raw: string | null | undefined, kind: LinkKind): string | null {
  if (!raw) return null;
  let title = raw.replace(/\s+/g, " ").trim();
  if (!title) return null;
  title = title.replace(TITLE_SUFFIX_RE, "").trim();

  const blocked = new Set([
    "Google Docs",
    "Google Documenten",
    "Google Sheets",
    "Google Spreadsheets",
    "Google Slides",
    "Google Presentaties",
    "Google Drive",
    "Sign in",
    "Inloggen",
  ]);
  if (blocked.has(title)) return null;
  if (/^https?:\/\//i.test(title)) return null;

  // Prefer real names over generic kind labels
  if (kind === "google_doc" && /^Google Doc$/i.test(title)) return null;
  if (kind === "google_sheet" && /^Google Sheet$/i.test(title)) return null;

  return title.slice(0, 120);
}

function candidateUrls(href: string, kind: LinkKind): string[] {
  const id = extractGoogleFileId(href);
  const urls = [href];
  if (!id) return urls;

  if (kind === "google_doc") {
    urls.unshift(
      `https://docs.google.com/document/d/${id}/edit?usp=sharing`,
      `https://docs.google.com/document/d/${id}/preview`,
    );
  } else if (kind === "google_sheet") {
    urls.unshift(
      `https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`,
      `https://docs.google.com/spreadsheets/d/${id}/htmlview`,
    );
  } else if (kind === "google_slides") {
    urls.unshift(
      `https://docs.google.com/presentation/d/${id}/edit?usp=sharing`,
      `https://docs.google.com/presentation/d/${id}/preview`,
    );
  } else if (kind === "google_drive") {
    urls.unshift(`https://drive.google.com/file/d/${id}/view?usp=sharing`);
  }
  return [...new Set(urls)];
}

function extractTitleFromHtml(html: string): string | null {
  const og =
    html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1];
  if (og) return og;
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null;
}

/** Best-effort page title for Google Workspace links. Returns null if private/unavailable. */
export async function fetchLinkPreviewTitle(href: string): Promise<string | null> {
  const kind = classifyLink(href);
  if (kind === "generic") return null;

  for (const url of candidateUrls(href, kind)) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (compatible; RevOpsLinkPreview/1.0; +https://localhost)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        continue;
      }
      const html = await res.text();
      const cleaned = cleanPreviewTitle(extractTitleFromHtml(html), kind);
      if (cleaned) return cleaned;
    } catch {
      // try next candidate
    }
  }
  return null;
}

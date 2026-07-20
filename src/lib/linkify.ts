export type LinkKind =
  | "google_doc"
  | "google_sheet"
  | "google_slides"
  | "google_drive"
  | "generic";

export type LinkSegment =
  | { type: "text"; value: string }
  | { type: "link"; href: string; label: string; kind: LinkKind };

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
const BARE_URL_RE = /https?:\/\/[^\s<>\[\]()]+/gi;

function normalizeUrl(raw: string): string | null {
  try {
    // ClickUp markdown sometimes escapes underscores in URLs
    const cleaned = raw.replace(/\\_/g, "_").replace(/[),.]+$/g, "");
    const url = new URL(cleaned);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function classifyLink(href: string): LinkKind {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname;

    if (host === "docs.google.com") {
      if (path.startsWith("/document/")) return "google_doc";
      if (path.startsWith("/spreadsheets/")) return "google_sheet";
      if (path.startsWith("/presentation/")) return "google_slides";
      return "google_drive";
    }
    if (host === "drive.google.com") return "google_drive";
    return "generic";
  } catch {
    return "generic";
  }
}

export function kindFallbackLabel(kind: LinkKind): string {
  if (kind === "google_doc") return "Google Doc";
  if (kind === "google_sheet") return "Google Sheet";
  if (kind === "google_slides") return "Google Slides";
  if (kind === "google_drive") return "Google Drive";
  return "Link";
}

export function linkChipLabel(href: string, kind: LinkKind, markdownLabel?: string): string {
  const trimmed = (markdownLabel || "").trim().replace(/\s+/g, " ");
  if (
    trimmed &&
    !/^https?:\/\//i.test(trimmed) &&
    !/^(docs|drive|sheets)\.google\.com$/i.test(trimmed) &&
    !/docs\.google\.com\//i.test(trimmed) &&
    trimmed.length <= 80
  ) {
    return trimmed;
  }

  if (kind !== "generic") return kindFallbackLabel(kind);

  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

export function extractLinks(input: string): Extract<LinkSegment, { type: "link" }>[] {
  return parseLinkifiedText(input).filter(
    (s): s is Extract<LinkSegment, { type: "link" }> => s.type === "link",
  );
}

/**
 * Collapse noisy ClickUp-style markdown link labels that repeat the hostname/URL
 * across multiple lines into a single clean chip label.
 */
function cleanMarkdownLabel(label: string, href: string): string {
  const lines = label
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return linkChipLabel(href, classifyLink(href));

  // Typical ClickUp paste: "docs.google.com" + full URL as label
  const meaningful = lines.filter((line) => {
    const normalized = normalizeUrl(line);
    if (normalized && normalizeUrl(href) && normalized === normalizeUrl(href)) return false;
    if (/^(docs|drive|sheets)\.google\.com$/i.test(line)) return false;
    if (/^https?:\/\//i.test(line)) return false;
    return true;
  });

  if (meaningful.length === 1) {
    return linkChipLabel(href, classifyLink(href), meaningful[0]);
  }
  if (meaningful.length > 1) {
    return linkChipLabel(href, classifyLink(href), meaningful.join(" "));
  }
  return linkChipLabel(href, classifyLink(href));
}

function pushText(segments: LinkSegment[], value: string) {
  if (!value) return;
  const last = segments[segments.length - 1];
  if (last?.type === "text") {
    last.value += value;
  } else {
    segments.push({ type: "text", value });
  }
}

function pushLink(segments: LinkSegment[], href: string, label: string, seen: Set<string>) {
  const kind = classifyLink(href);
  // Collapse adjacent duplicate chips for the same URL (common in ClickUp markdown)
  const last = segments[segments.length - 1];
  if (last?.type === "link" && last.href === href) return;
  if (seen.has(href)) {
    // Still skip exact duplicate chips elsewhere in the same block when back-to-back
    // text between them is only whitespace
    if (last?.type === "text" && !last.value.trim()) {
      segments.pop();
      const prev = segments[segments.length - 1];
      if (prev?.type === "link" && prev.href === href) return;
    }
  }
  seen.add(href);
  segments.push({ type: "link", href, label, kind });
}

function parseBareUrls(text: string, segments: LinkSegment[], seen: Set<string>) {
  BARE_URL_RE.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BARE_URL_RE.exec(text)) !== null) {
    pushText(segments, text.slice(lastIndex, match.index));
    const href = normalizeUrl(match[0]);
    if (href) {
      pushLink(segments, href, linkChipLabel(href, classifyLink(href)), seen);
    } else {
      pushText(segments, match[0]);
    }
    lastIndex = match.index + match[0].length;
  }
  pushText(segments, text.slice(lastIndex));
}

/** Parse markdown links and bare URLs into text/link segments for chip rendering. */
export function parseLinkifiedText(input: string): LinkSegment[] {
  if (!input) return [];

  const segments: LinkSegment[] = [];
  const seen = new Set<string>();
  let lastIndex = 0;

  MARKDOWN_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK_RE.exec(input)) !== null) {
    const before = input.slice(lastIndex, match.index);
    parseBareUrls(before, segments, seen);

    const href = normalizeUrl(match[2]);
    if (href) {
      pushLink(segments, href, cleanMarkdownLabel(match[1], href), seen);
    } else {
      pushText(segments, match[0]);
    }
    lastIndex = match.index + match[0].length;
  }

  parseBareUrls(input.slice(lastIndex), segments, seen);

  // Trim leading/trailing whitespace-only text segments for cleaner view mode
  while (segments[0]?.type === "text" && !segments[0].value.trim()) {
    segments.shift();
  }
  while (
    segments.length > 0 &&
    segments[segments.length - 1]?.type === "text" &&
    !segments[segments.length - 1]!.value.trim()
  ) {
    segments.pop();
  }

  return segments;
}

export function hasLinkSegments(input: string): boolean {
  return parseLinkifiedText(input).some((s) => s.type === "link");
}

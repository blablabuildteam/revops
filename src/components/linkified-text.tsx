"use client";

import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Link2,
  Presentation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  extractLinks,
  LinkKind,
  LinkSegment,
  parseLinkifiedText,
} from "@/lib/linkify";
import { useLinkPreviewTitles } from "@/hooks/use-link-preview-titles";

function kindIcon(kind: LinkKind) {
  switch (kind) {
    case "google_doc":
      return FileText;
    case "google_sheet":
      return FileSpreadsheet;
    case "google_slides":
      return Presentation;
    case "google_drive":
      return FileText;
    default:
      return Link2;
  }
}

function kindChipClass(kind: LinkKind): string {
  switch (kind) {
    case "google_doc":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20";
    case "google_sheet":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20";
    case "google_slides":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20";
    case "google_drive":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-500/20";
    default:
      return "border-neutral-600 bg-neutral-800 text-neutral-200 hover:bg-neutral-700";
  }
}

function LinkChip({
  segment,
  resolvedTitle,
  compact,
}: {
  segment: Extract<LinkSegment, { type: "link" }>;
  resolvedTitle?: string;
  compact?: boolean;
}) {
  const Icon = kindIcon(segment.kind);
  // Prefer the live Google Workspace title when we could resolve it.
  const chipLabel =
    resolvedTitle && segment.kind !== "generic"
      ? resolvedTitle
      : segment.label;

  return (
    <a
      href={segment.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex max-w-full items-center rounded-full border font-medium transition-colors align-middle",
        compact ? "gap-1 px-2 py-0.5 text-[10px] max-w-[11rem]" : "gap-1.5 px-2.5 py-1 text-xs",
        kindChipClass(segment.kind),
      )}
      title={resolvedTitle ? `${resolvedTitle}\n${segment.href}` : segment.href}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Icon className={cn("shrink-0 opacity-80", compact ? "size-3" : "size-3.5")} />
      <span className="truncate">{chipLabel}</span>
      {!compact && <ExternalLink className="size-3 shrink-0 opacity-50" />}
    </a>
  );
}

export function LinkifiedText({
  text,
  className,
  emptyLabel = "No notes",
  resolveTitles = true,
}: {
  text: string;
  className?: string;
  emptyLabel?: string;
  resolveTitles?: boolean;
}) {
  const trimmed = text.trim();
  const segments = trimmed ? parseLinkifiedText(text) : [];
  const hrefs = resolveTitles
    ? segments.filter((s) => s.type === "link").map((s) => s.href)
    : [];
  const titles = useLinkPreviewTitles(hrefs);

  if (!trimmed) {
    return <p className={cn("text-sm text-neutral-600", className)}>{emptyLabel}</p>;
  }

  return (
    <div className={cn("text-sm text-neutral-300 whitespace-pre-wrap break-words", className)}>
      {segments.map((segment, i) => {
        if (segment.type === "text") {
          const value = segment.value.replace(/\n{3,}/g, "\n\n");
          if (!value) return null;
          return <span key={i}>{value}</span>;
        }
        return (
          <span key={i} className="inline-block my-0.5 mr-1.5 last:mr-0">
            <LinkChip segment={segment} resolvedTitle={titles[segment.href]} />
          </span>
        );
      })}
    </div>
  );
}

/** Compact link chips for board cards (links only, capped). */
export function BoardLinkChips({
  text,
  max = 2,
  className,
}: {
  text: string;
  max?: number;
  className?: string;
}) {
  const links = extractLinks(text);
  const hrefs = links.map((l) => l.href);
  const titles = useLinkPreviewTitles(hrefs);

  if (links.length === 0) return null;

  const visible = links.slice(0, max);
  const remaining = links.length - visible.length;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1 mt-1", className)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {visible.map((link) => (
        <LinkChip
          key={link.href}
          segment={link}
          resolvedTitle={titles[link.href]}
          compact
        />
      ))}
      {remaining > 0 && (
        <span className="text-[10px] text-neutral-600">+{remaining}</span>
      )}
    </div>
  );
}

/** Live chip row for all links in text — updates as the user types/pastes. */
export function LiveLinkChips({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const links = extractLinks(text);
  const hrefs = links.map((l) => l.href);
  const titles = useLinkPreviewTitles(hrefs);

  if (links.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {links.map((link) => (
        <LinkChip
          key={link.href}
          segment={link}
          resolvedTitle={titles[link.href]}
        />
      ))}
    </div>
  );
}

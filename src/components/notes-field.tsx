"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LiveLinkChips } from "@/components/linkified-text";
import { extractLinks } from "@/lib/linkify";

/** Always-editable notes with live link chips (no Edit toggle, no save required for chips). */
export function NotesField({
  value,
  onChange,
  label = "Notes",
  placeholder = "Add notes or details...",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const hasLinks = extractLinks(value).length > 0;

  return (
    <div className="space-y-2">
      <Label className="text-neutral-400 text-xs">{label}</Label>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden focus-within:border-neutral-600 transition-colors">
        {hasLinks && (
          <div
            className="px-3.5 pt-3"
            onMouseDown={(e) => e.preventDefault()}
          >
            <LiveLinkChips text={value} />
          </div>
        )}
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={5}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 rounded-none min-h-[7.5rem] text-neutral-100 placeholder:text-neutral-600 resize-none select-text"
        />
      </div>
    </div>
  );
}

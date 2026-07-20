"use client";

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LinkifiedText, LiveLinkChips } from "@/components/linkified-text";
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
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasLinks = extractLinks(value).length > 0;
  const showEditor = focused || !value.trim();

  useEffect(() => {
    if (focused) {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      });
    }
  }, [focused]);

  return (
    <div className="space-y-2">
      <Label className="text-neutral-400 text-xs">{label}</Label>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden focus-within:border-neutral-600 transition-colors">
        {showEditor ? (
          <>
            {hasLinks && (
              <div
                className="px-3.5 pt-3"
                onMouseDown={(e) => e.preventDefault()}
              >
                <LiveLinkChips text={value} />
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              rows={5}
              className="border-0 bg-transparent shadow-none focus-visible:ring-0 rounded-none min-h-[7.5rem] text-neutral-100 placeholder:text-neutral-600 resize-none"
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setFocused(true)}
            className="w-full text-left px-3.5 py-3 min-h-[7.5rem] cursor-text hover:bg-neutral-900/80 transition-colors"
          >
            <LinkifiedText text={value} emptyLabel={placeholder} />
          </button>
        )}
      </div>
    </div>
  );
}

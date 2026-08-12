"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function InfoHint({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={`Uitleg: ${label}`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 transition-colors align-middle"
      >
        <Info className="w-3 h-3" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-3 text-xs leading-relaxed text-neutral-300"
      >
        <p className="font-medium text-neutral-100 mb-1.5">{label}</p>
        <div className="space-y-1.5 text-neutral-400">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

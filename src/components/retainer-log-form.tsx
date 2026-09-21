"use client";

import type { ElementType, FormEvent, KeyboardEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_ASSIGNEES } from "@/lib/types";
import { cn } from "@/lib/utils";

export type RetainerLogFormValues = {
  hours: string;
  workDate: string;
  activity: string;
  category: string;
  loggedBy: string;
};

export function RetainerLogForm({
  values,
  onChange,
  buckets,
  saving,
  submitLabel,
  submitIcon: SubmitIcon,
  onSubmit,
  extraActions,
  showLoggedBy = true,
  className,
  onCancel,
  autoFocus = false,
}: {
  values: RetainerLogFormValues;
  onChange: (patch: Partial<RetainerLogFormValues>) => void;
  buckets: { id: string; label: string }[];
  saving: boolean;
  submitLabel: string;
  submitIcon?: ElementType;
  onSubmit: (e: FormEvent) => void;
  extraActions?: ReactNode;
  showLoggedBy?: boolean;
  className?: string;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  function handleKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={handleKeyDown}
      className={cn(
        "rounded-lg border border-[#d4e052]/25 bg-[#d4e052]/5 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 items-end",
        showLoggedBy
          ? "lg:grid-cols-[5.5rem_9.5rem_1fr_9rem_8rem_auto]"
          : "lg:grid-cols-[5.5rem_9.5rem_1fr_9rem_auto]",
        className,
      )}
    >
      <div className="space-y-1">
        <Label className="text-[11px] text-neutral-500">Uren</Label>
        <Input
          type="number"
          step="0.25"
          min="0.25"
          value={values.hours}
          onChange={(e) => onChange({ hours: e.target.value })}
          placeholder="8"
          className="bg-neutral-900 border-neutral-700 h-9"
          required
          autoFocus={autoFocus}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-neutral-500">Datum</Label>
        <DatePicker
          value={values.workDate}
          onChange={(next) => onChange({ workDate: next })}
          placeholder="Kies datum"
          className="h-9 bg-neutral-900 border-neutral-700 text-neutral-100"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-neutral-500">Wat gedaan?</Label>
        <Input
          value={values.activity}
          onChange={(e) => onChange({ activity: e.target.value })}
          placeholder="bijv. deleted-users kickoff"
          className="bg-neutral-900 border-neutral-700 h-9"
          required
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-neutral-500">Bucket</Label>
        <Select
          value={values.category || "__none__"}
          onValueChange={(v) =>
            onChange({ category: !v || v === "__none__" ? "" : v })
          }
        >
          <SelectTrigger className="w-full bg-neutral-900 border-neutral-700 h-9">
            <SelectValue placeholder="Optioneel">
              {values.category || "Geen"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            <SelectItem value="__none__">Geen</SelectItem>
            {buckets.map((b) => (
              <SelectItem key={b.id} value={b.label}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showLoggedBy && (
        <div className="space-y-1">
          <Label className="text-[11px] text-neutral-500">Door</Label>
          <Select
            value={values.loggedBy}
            onValueChange={(v) =>
              onChange({ loggedBy: v ?? TASK_ASSIGNEES[0] })
            }
          >
            <SelectTrigger className="w-full bg-neutral-900 border-neutral-700 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start">
              {TASK_ASSIGNEES.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex items-center gap-2">
        {extraActions}
        <Button
          type="submit"
          disabled={saving}
          className="h-9 bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 gap-1.5"
        >
          {SubmitIcon ? <SubmitIcon className="w-3.5 h-3.5" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

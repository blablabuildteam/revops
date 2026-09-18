"use client";

import { Check, User } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatAssigneeNames } from "@/lib/todo-assignees";
import { cn } from "@/lib/utils";

export type TodoAssigneeOption = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

function toggleAssigneeId(selectedIds: string[], id: string) {
  return selectedIds.includes(id)
    ? selectedIds.filter((value) => value !== id)
    : [...selectedIds, id];
}

export function TodoAssigneePicker({
  people,
  selectedIds,
  onChange,
}: {
  people: TodoAssigneeOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 flex-wrap min-h-8"
      role="group"
      aria-label="Assigned to"
    >
      {people.map((person) => {
        const active = selectedIds.includes(person.id);
        return (
          <button
            key={person.id}
            type="button"
            aria-pressed={active}
            aria-label={`${active ? "Unassign" : "Assign"} ${person.name}`}
            title={person.name}
            onClick={() => onChange(toggleAssigneeId(selectedIds, person.id))}
            className={cn(
              "flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs border transition-opacity",
              active
                ? "opacity-100 border-[#d4e052]/70 bg-[#d4e052]/10 text-neutral-100"
                : "opacity-50 border-neutral-700 hover:opacity-80 text-neutral-400",
            )}
          >
            <UserAvatar
              name={person.name}
              avatarUrl={person.avatar_url}
              size="sm"
              className="rounded-full"
            />
            <span className="truncate max-w-24">{person.name}</span>
          </button>
        );
      })}
      {selectedIds.length === 0 && (
        <span className="text-xs text-neutral-500">Nobody</span>
      )}
    </div>
  );
}

export function TodoAssigneeSelect({
  people,
  selectedIds,
  label,
  onChange,
  className,
}: {
  people: TodoAssigneeOption[];
  selectedIds: string[];
  label?: string | null;
  onChange: (ids: string[]) => void;
  className?: string;
}) {
  const display =
    label ||
    formatAssigneeNames(
      selectedIds.map((id) => people.find((person) => person.id === id) ?? { name: "" }),
    ) ||
    "Nobody";

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={`Assigned to ${display}. Click to change.`}
        title="Click to assign someone else too"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-200 transition-colors rounded-md px-1.5 py-1 -mx-1.5 hover:bg-neutral-800/80 max-w-48 cursor-pointer",
          className,
        )}
      >
        <User className="w-3 h-3 shrink-0" />
        <span className="truncate">{display}</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="p-1 min-w-[11rem]"
        onClick={(e) => e.stopPropagation()}
      >
        {people.map((person) => {
          const active = selectedIds.includes(person.id);
          return (
            <button
              key={person.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(toggleAssigneeId(selectedIds, person.id))}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              <Check
                className={cn(
                  "w-3.5 h-3.5 shrink-0",
                  active ? "text-[#d4e052] opacity-100" : "opacity-0",
                )}
              />
              <UserAvatar
                name={person.name}
                avatarUrl={person.avatar_url}
                size="sm"
                className="rounded-full"
              />
              <span className="truncate">{person.name}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

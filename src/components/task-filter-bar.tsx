"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Plus,
  X,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/date-picker";
import { Milestone, Task, TASK_ASSIGNEES, resolvePhaseColor } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterField = "phase" | "priority" | "assignee" | "due_date";

type FilterOperator = "is" | "is_not";
type DateOperator = "is" | "is_not" | "before" | "after";

interface FilterRule {
  id: string;
  field: FilterField;
  operator: FilterOperator | DateOperator;
  value: string;
}

const FIELD_META: Record<FilterField, { label: string; icon: string }> = {
  phase: { label: "Phase", icon: "◉" },
  priority: { label: "Priority", icon: "⚑" },
  assignee: { label: "Assignee", icon: "👤" },
  due_date: { label: "Due date", icon: "📅" },
};

const OPERATOR_LABELS: Record<string, string> = {
  is: "is",
  is_not: "is not",
  before: "before",
  after: "after",
};

const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const DATE_PRESET_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "next_week", label: "Next week" },
  { value: "no_date", label: "No date" },
];

let ruleCounter = 0;
function nextRuleId() {
  return `filter-${++ruleCounter}`;
}

// ---------------------------------------------------------------------------
// Filter logic
// ---------------------------------------------------------------------------

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getWeekRange(offset: number): [Date, Date] {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = startOfDay(new Date(now));
  monday.setDate(monday.getDate() + mondayOffset + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return [monday, sunday];
}

function matchesDateValue(
  dueDate: string | null | undefined,
  value: string,
  operator: string,
): boolean {
  const today = startOfDay(new Date());

  if (value === "no_date") {
    const hasDate = !!dueDate;
    return operator === "is" ? !hasDate : hasDate;
  }

  if (!dueDate) return false;
  const taskDate = startOfDay(new Date(dueDate));

  if (value === "overdue") {
    const isOverdue = taskDate < today;
    return operator === "is" ? isOverdue : !isOverdue;
  }

  if (value === "today") {
    const isToday = taskDate.getTime() === today.getTime();
    return operator === "is" ? isToday : !isToday;
  }

  if (value === "this_week") {
    const [start, end] = getWeekRange(0);
    const inRange = taskDate >= start && taskDate <= end;
    return operator === "is" ? inRange : !inRange;
  }

  if (value === "next_week") {
    const [start, end] = getWeekRange(1);
    const inRange = taskDate >= start && taskDate <= end;
    return operator === "is" ? inRange : !inRange;
  }

  const compareDate = startOfDay(new Date(value));
  switch (operator) {
    case "is":
      return taskDate.getTime() === compareDate.getTime();
    case "is_not":
      return taskDate.getTime() !== compareDate.getTime();
    case "before":
      return taskDate < compareDate;
    case "after":
      return taskDate > compareDate;
    default:
      return true;
  }
}

function taskMatchesRule(
  task: Task,
  rule: FilterRule,
  milestones: Milestone[],
): boolean {
  const { field, operator, value } = rule;
  if (!value) return true;

  switch (field) {
    case "phase": {
      const matches = task.milestone_id === value || (!task.milestone_id && value === "Unassigned");
      return operator === "is" ? matches : !matches;
    }
    case "priority": {
      const matches = (task.priority ?? "low") === value;
      return operator === "is" ? matches : !matches;
    }
    case "assignee": {
      const taskAssignee = task.assignee || "unassigned";
      const matches = taskAssignee === value;
      return operator === "is" ? matches : !matches;
    }
    case "due_date": {
      return matchesDateValue(task.due_date, value, operator);
    }
    default:
      return true;
  }
}

export function applyTaskFilters(
  tasks: Task[],
  filters: FilterRule[],
  milestones: Milestone[],
): Task[] {
  if (filters.length === 0) return tasks;
  const activeFilters = filters.filter((f) => f.value);
  if (activeFilters.length === 0) return tasks;
  return tasks.filter((task) =>
    activeFilters.every((rule) => taskMatchesRule(task, rule, milestones)),
  );
}

// ---------------------------------------------------------------------------
// Field picker dropdown
// ---------------------------------------------------------------------------

function FieldPicker({
  onSelect,
}: {
  onSelect: (field: FilterField) => void;
}) {
  const [search, setSearch] = useState("");
  const fields = (Object.keys(FIELD_META) as FilterField[]).filter((f) =>
    FIELD_META[f].label.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="w-48 py-1">
      <div className="px-2 pb-1.5">
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="h-7 text-xs bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
        />
      </div>
      {fields.map((field) => (
        <button
          key={field}
          type="button"
          onClick={() => onSelect(field)}
          className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 transition-colors text-left"
        >
          <span className="text-xs w-4 text-center">{FIELD_META[field].icon}</span>
          {FIELD_META[field].label}
        </button>
      ))}
      {fields.length === 0 && (
        <p className="px-3 py-2 text-xs text-neutral-600">No matching fields</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operator selector
// ---------------------------------------------------------------------------

function OperatorSelect({
  field,
  value,
  onChange,
}: {
  field: FilterField;
  value: string;
  onChange: (op: string) => void;
}) {
  const options = field === "due_date"
    ? ["is", "is_not", "before", "after"]
    : ["is", "is_not"];

  return (
    <Popover>
      <PopoverTrigger
        className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 border border-neutral-700/60 rounded px-2 py-1 hover:border-neutral-600 transition-colors shrink-0 cursor-pointer"
      >
        {OPERATOR_LABELS[value] ?? value}
        <ChevronDown className="w-3 h-3" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-28">
        {options.map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => onChange(op)}
            className={`w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors ${
              op === value
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            }`}
          >
            {OPERATOR_LABELS[op]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Value selector
// ---------------------------------------------------------------------------

function ValueSelect({
  field,
  value,
  onChange,
  milestones,
}: {
  field: FilterField;
  value: string;
  onChange: (val: string) => void;
  milestones: Milestone[];
}) {
  const options = useMemo(() => {
    switch (field) {
      case "phase":
        return [
          ...milestones.map((m) => ({
            value: m.id,
            label: m.name,
            color: resolvePhaseColor(m.name, m.color),
          })),
          { value: "Unassigned", label: "Unassigned", color: "#a3a3a3" },
        ];
      case "priority":
        return PRIORITY_OPTIONS.map((p) => ({ ...p, color: undefined }));
      case "assignee":
        return [
          ...TASK_ASSIGNEES.map((name) => ({
            value: name,
            label: name,
            color: undefined,
          })),
          { value: "unassigned", label: "Unassigned", color: undefined },
        ];
      case "due_date":
        return DATE_PRESET_OPTIONS.map((d) => ({ ...d, color: undefined }));
      default:
        return [];
    }
  }, [field, milestones]);

  const selectedLabel = options.find((o) => o.value === value)?.label;
  const isDateField = field === "due_date";
  const isCustomDate = isDateField && value && !DATE_PRESET_OPTIONS.some((d) => d.value === value);

  return (
    <Popover>
      <PopoverTrigger
        className={`flex items-center gap-1.5 text-xs border border-neutral-700/60 rounded px-2 py-1 hover:border-neutral-600 transition-colors shrink-0 max-w-[180px] cursor-pointer ${
          value ? "text-neutral-200" : "text-neutral-500"
        }`}
      >
        {value && field === "phase" && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: options.find((o) => o.value === value)?.color }}
          />
        )}
        <span className="truncate">
          {isCustomDate ? value : (selectedLabel ?? "Select option")}
        </span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className={isDateField ? "w-auto p-2" : "w-48"}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors ${
              opt.value === value
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            }`}
          >
            {opt.color && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: opt.color }}
              />
            )}
            {opt.label}
          </button>
        ))}
        {isDateField && (
          <>
            <div className="border-t border-neutral-800 my-1" />
            <div className="px-1 py-1">
              <Calendar
                value={isCustomDate ? value : ""}
                onSelect={(v) => {
                  if (v) onChange(v);
                }}
              />
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Single filter row
// ---------------------------------------------------------------------------

function FilterRow({
  rule,
  milestones,
  onUpdate,
  onRemove,
}: {
  rule: FilterRule;
  milestones: Milestone[];
  onUpdate: (id: string, patch: Partial<FilterRule>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-neutral-400 font-medium min-w-[60px]">
        {FIELD_META[rule.field].label}
      </span>
      <OperatorSelect
        field={rule.field}
        value={rule.operator}
        onChange={(op) => onUpdate(rule.id, { operator: op as FilterOperator })}
      />
      <ValueSelect
        field={rule.field}
        value={rule.value}
        onChange={(val) => onUpdate(rule.id, { value: val })}
        milestones={milestones}
      />
      <button
        type="button"
        onClick={() => onRemove(rule.id)}
        className="text-neutral-700 hover:text-neutral-400 transition-colors p-0.5 rounded"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported hook + component
// ---------------------------------------------------------------------------

export function useTaskFilters() {
  const [filters, setFilters] = useState<FilterRule[]>([]);

  const addFilter = useCallback((field: FilterField) => {
    setFilters((prev) => [
      ...prev,
      {
        id: nextRuleId(),
        field,
        operator: "is",
        value: "",
      },
    ]);
  }, []);

  const updateFilter = useCallback(
    (id: string, patch: Partial<FilterRule>) => {
      setFilters((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  const removeFilter = useCallback((id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
  }, []);

  return { filters, addFilter, updateFilter, removeFilter, clearFilters };
}

export function TaskFilterBar({
  filters,
  milestones,
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
  onClearFilters,
}: {
  filters: FilterRule[];
  milestones: Milestone[];
  onAddFilter: (field: FilterField) => void;
  onUpdateFilter: (id: string, patch: Partial<FilterRule>) => void;
  onRemoveFilter: (id: string) => void;
  onClearFilters: () => void;
}) {
  const activeCount = filters.filter((f) => f.value).length;

  return (
    <div className="space-y-2">
      {filters.map((rule) => (
        <FilterRow
          key={rule.id}
          rule={rule}
          milestones={milestones}
          onUpdate={onUpdateFilter}
          onRemove={onRemoveFilter}
        />
      ))}

      <div className="flex items-center justify-between">
        <Popover>
          <PopoverTrigger
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 py-1 rounded hover:bg-neutral-800/50 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Add filter
          </PopoverTrigger>
          <PopoverContent align="start" className="p-0 w-48">
            <FieldPicker onSelect={onAddFilter} />
          </PopoverContent>
        </Popover>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

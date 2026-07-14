"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Check, X, Copy, Trash2, Users, Calendar, FolderKanban, Pencil, FolderInput, Filter,
} from "lucide-react";
import { PriorityFlag } from "@/components/priority-flag";
import Link from "next/link";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BinaryText } from "@/components/binary-text";
import { CompanyAvatar } from "@/components/company-avatar";
import { useConfirmDelete } from "@/components/confirm-delete-dialog";
import { EditStatusesDialog } from "@/components/edit-statuses-dialog";
import { TaskFilterBar, useTaskFilters, applyTaskFilters } from "@/components/task-filter-bar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { getProject, getProjects, createMilestone, createTask, updateTask, deleteTask, deleteMilestone, deleteProject } from "@/lib/api";
import { Project, Milestone, Task, TASK_ASSIGNEES, resolvePhaseColor, defaultColorForPhaseName, CUSTOM_PHASE_DEFAULT_COLOR } from "@/lib/types";
import { formatDate, toDateInputValue } from "@/lib/format";

const TASK_ROW_GRID =
  "grid grid-cols-[20px_minmax(0,1fr)_32px_140px_150px_150px_32px] items-center gap-x-3 gap-y-2";

type TasksByMilestone = Record<string, Task[]>;
type ProjectDetail = Project & { milestones: (Milestone & { tasks: Task[] })[]; unassigned_tasks: Task[] };

const UNASSIGNED_ID = "unassigned";

function isApprovedTask(task: Task) {
  return task.approved !== false;
}

function sortByPosition(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

function buildTasksByMilestone(
  milestones: (Milestone & { tasks: Task[] })[],
  unassignedTasks: Task[] = [],
): TasksByMilestone {
  const map: TasksByMilestone = {};
  for (const m of milestones) {
    map[m.id] = sortByPosition(m.tasks || []);
  }
  const unassigned = sortByPosition(unassignedTasks.filter(isApprovedTask));
  if (unassigned.length > 0) {
    map[UNASSIGNED_ID] = unassigned;
  }
  return map;
}

function findContainer(
  id: string,
  tasksByMilestone: TasksByMilestone,
  milestoneIds: string[],
): string | null {
  if (id === UNASSIGNED_ID) return UNASSIGNED_ID;
  if (milestoneIds.includes(id)) return id;
  for (const [milestoneId, tasks] of Object.entries(tasksByMilestone)) {
    if (tasks.some((t) => t.id === id)) return milestoneId;
  }
  return null;
}

function isTopLevelTask(task: Task) {
  return isApprovedTask(task) && !task.parent_id;
}

function groupSubtasksByParent(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!isApprovedTask(task) || !task.parent_id) continue;
    const list = map.get(task.parent_id) ?? [];
    list.push(task);
    map.set(task.parent_id, list);
  }
  for (const [parentId, list] of map) {
    map.set(parentId, sortByPosition(list));
  }
  return map;
}

function getChildTasks(tasksByMilestone: TasksByMilestone, parentId: string): Task[] {
  return sortByPosition(
    Object.values(tasksByMilestone)
      .flat()
      .filter((t) => t.parent_id === parentId),
  );
}

function containerToMilestoneId(containerId: string): string | null {
  return containerId === UNASSIGNED_ID ? null : containerId;
}

function reorderTopLevelInContainer(
  containerTasks: Task[],
  activeId: string,
  overId: string,
  milestoneIds: string[],
): Task[] | null {
  const pending = containerTasks.filter((t) => !isApprovedTask(t));
  const approved = containerTasks.filter(isApprovedTask);
  const topLevel = sortByPosition(approved.filter(isTopLevelTask));
  const subtasks = approved.filter((t) => t.parent_id);

  const oldIndex = topLevel.findIndex((t) => t.id === activeId);
  if (oldIndex === -1) return null;

  let newIndex: number;
  if (milestoneIds.includes(overId)) {
    newIndex = topLevel.length - 1;
  } else {
    newIndex = topLevel.findIndex((t) => t.id === overId);
    if (newIndex === -1) return null;
  }

  if (oldIndex === newIndex) return null;

  const reorderedTop = arrayMove(topLevel, oldIndex, newIndex);
  const rebuilt = reorderedTop.flatMap((t) => [
    t,
    ...sortByPosition(subtasks.filter((s) => s.parent_id === t.id)),
  ]);
  return [...pending, ...rebuilt];
}

function PhaseColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <label
      title="Phase color"
      className="group relative h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-neutral-700 p-[3px] transition-colors hover:border-neutral-500"
      style={{
        background: "conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #84cc16, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)",
      }}
    >
      <span
        className="flex h-full w-full items-center justify-center rounded-[5px] bg-neutral-950/90"
      >
        <span
          className="h-3.5 w-3.5 rounded-full border border-neutral-600 shadow-sm transition-transform group-hover:scale-110"
          style={{ backgroundColor: value }}
        />
      </span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

function TaskColumnHeader() {
  return (
    <div className={`${TASK_ROW_GRID} px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-600 border-b border-neutral-800/60`}>
      <span />
      <span>Task</span>
      <span />
      <span>Responsible</span>
      <span>Date</span>
      <span>Phase</span>
      <span />
    </div>
  );
}

function TaskDetailDialog({
  task,
  open,
  onClose,
  onSave,
}: {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onSave: (t: Task) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    due_date: "",
    assignee: "",
    description: "",
    url: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (task && open) {
      setForm({
        title: task.title,
        due_date: toDateInputValue(task.due_date),
        assignee: task.assignee ?? "",
        description: task.description ?? "",
        url: task.url ?? "",
      });
    }
  }, [task, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    const title = form.title.trim();
    if (!title) return;
    setLoading(true);
    try {
      const updated = await updateTask(task.id, {
        title,
        due_date: form.due_date || null,
        assignee: form.assignee || null,
        description: form.description || null,
        url: form.url || null,
      });
      onSave(updated);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-neutral-100 pr-6">Edit task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Task title..."
              required
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Date</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="bg-neutral-800 border-neutral-700 text-neutral-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Responsible</Label>
              <Select
                value={form.assignee || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, assignee: v === "none" ? "" : (v ?? "") }))}
              >
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue placeholder="Choose person">
                    {form.assignee || "Nobody"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="none" className="text-neutral-400">Nobody</SelectItem>
                  {TASK_ASSIGNEES.map((name) => (
                    <SelectItem key={name} value={name} className="text-neutral-100">{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">URL</Label>
            <Input
              type="url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://..."
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Notes</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Add notes or details..."
              rows={4}
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 resize-none"
            />
          </div>
          <DialogFooter className="bg-transparent border-neutral-800 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="text-neutral-400 hover:text-neutral-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !form.title.trim()}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950"
            >
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PendingTaskRow({
  task,
  onDelete,
  onApprove,
}: {
  task: Task;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-orange-950/30 border border-orange-900/40 rounded-lg mx-2 my-1">
      <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-orange-200">{task.title}</p>
        {task.description && <p className="text-xs text-orange-400/60 mt-0.5 truncate"><BinaryText text={task.description} id={`${task.id}-desc`} /></p>}
        <p className="text-xs text-orange-600 mt-0.5">Client request</p>
      </div>
      <button onClick={() => onApprove(task.id)}
        className="flex items-center gap-1 text-xs bg-emerald-900/50 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-900 transition-colors">
        <Check className="w-3 h-3" /> Approve
      </button>
      <button onClick={() => onDelete(task.id)}
        className="text-neutral-600 hover:text-red-400 transition-colors p-1 rounded hover:bg-neutral-800">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function cancelDrag(e: React.PointerEvent) {
  e.stopPropagation();
}

function InlineAssigneeSelect({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (t: Task) => void;
}) {
  return (
    <Select
      value={task.assignee || "none"}
      onValueChange={(v) => {
        if (!v || v === "none") {
          updateTask(task.id, { assignee: undefined }).then(onUpdate);
        } else {
          updateTask(task.id, { assignee: v }).then(onUpdate);
        }
      }}
    >
      <SelectTrigger
        size="sm"
        className="h-7 w-full text-xs bg-neutral-800/50 border-neutral-700/50 text-neutral-400 px-2"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={cancelDrag}
      >
        <SelectValue placeholder="—">
          {task.assignee || "—"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-neutral-800 border-neutral-700">
        <SelectItem value="none" className="text-neutral-500 text-xs">—</SelectItem>
        {TASK_ASSIGNEES.map((name) => (
          <SelectItem key={name} value={name} className="text-neutral-100 text-xs">{name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InlineDateInput({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (t: Task) => void;
}) {
  const value = toDateInputValue(task.due_date);

  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => {
        updateTask(task.id, { due_date: e.target.value || null }).then(onUpdate);
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={cancelDrag}
      className="h-7 w-full text-xs bg-neutral-800/50 border-neutral-700/50 text-neutral-400 px-2 font-mono"
    />
  );
}

function InlinePhaseSelect({
  task,
  currentMilestoneId,
  milestones,
  onPhaseChange,
}: {
  task: Task;
  currentMilestoneId: string;
  milestones: Milestone[];
  onPhaseChange: (taskId: string, fromMilestoneId: string, toMilestoneId: string) => void;
}) {
  const isUnassigned = currentMilestoneId === UNASSIGNED_ID;
  const current = milestones.find((m) => m.id === currentMilestoneId);
  const currentColor = current ? resolvePhaseColor(current.name, current.color) : undefined;

  return (
    <Select
      value={isUnassigned ? "unassigned" : currentMilestoneId}
      onValueChange={(v) => {
        if (!v || v === "unassigned" || v === currentMilestoneId) return;
        onPhaseChange(task.id, currentMilestoneId, v);
      }}
    >
      <SelectTrigger
        size="sm"
        className="h-7 w-full text-xs bg-neutral-800/50 border-neutral-700/50 px-2 gap-1.5"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={cancelDrag}
      >
        <SelectValue placeholder="Phase">
          {isUnassigned ? (
            <span className="text-neutral-500 truncate">Unassigned</span>
          ) : current && (
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: currentColor }}
              />
              <span className="truncate" style={{ color: currentColor }}>
                {current.name}
              </span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-neutral-800 border-neutral-700">
        {milestones.map((m) => {
          const color = resolvePhaseColor(m.name, m.color);
          return (
            <SelectItem key={m.id} value={m.id} className="text-xs">
              <span className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span style={{ color }}>{m.name}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function TaskNameCell({
  task,
  onOpen,
  onRename,
  allowSubtasks,
  onAddSubtask,
  indent = false,
}: {
  task: Task;
  onOpen: () => void;
  onRename: (title: string) => Promise<void>;
  allowSubtasks?: boolean;
  onAddSubtask?: () => void;
  indent?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setValue(task.title);
  }, [task.title, editing]);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  async function commit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setValue(task.title);
      setEditing(false);
      return;
    }
    if (trimmed !== task.title) {
      await onRename(trimmed);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { void commit(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
          if (e.key === "Escape") {
            setValue(task.title);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={cancelDrag}
        className={`h-7 text-xs bg-neutral-800 border-neutral-600 text-neutral-100 flex-1 min-w-0 ${indent ? "ml-5" : ""}`}
      />
    );
  }

  return (
    <div
      className={`min-w-0 flex-1 flex items-center gap-0.5 ${indent ? "pl-5 border-l border-neutral-800/80 ml-1" : ""}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left cursor-pointer"
      >
        <p className="text-sm truncate text-neutral-200">
          <BinaryText text={task.title} id={task.id} />
        </p>
        {task.description && !indent && (
          <p className="text-xs text-neutral-600 truncate">
            <BinaryText text={task.description} id={`${task.id}-desc`} />
          </p>
        )}
      </button>
      <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          title="Rename"
          onClick={startEdit}
          onPointerDown={cancelDrag}
          className="p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800"
        >
          <Pencil className="w-4 h-4" />
        </button>
        {allowSubtasks && onAddSubtask && (
          <button
            type="button"
            title="Add subtask"
            onClick={(e) => {
              e.stopPropagation();
              onAddSubtask();
            }}
            onPointerDown={cancelDrag}
            className="p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function SubtaskRow({
  task,
  onUpdate,
  onDelete,
  onClick,
  onRename,
  selected,
  onToggleSelect,
}: {
  task: Task;
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
  onClick: (t: Task) => void;
  onRename: (id: string, title: string) => Promise<void>;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete(task.id);
  }

  return (
    <div
      className={`${TASK_ROW_GRID} px-3 py-1.5 rounded-lg hover:bg-neutral-900/50 transition-colors group ${selected ? "bg-[#e8ff47]/[0.06] ring-1 ring-[#e8ff47]/20" : ""}`}
    >
      <label
        className={`flex items-center justify-center cursor-pointer transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={cancelDrag}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(task.id)}
          className="sr-only"
        />
        <span className={`flex items-center justify-center w-3.5 h-3.5 rounded border transition-colors cursor-pointer ${
          selected
            ? "border-[#e8ff47]/50 bg-[#e8ff47]/15"
            : "border-neutral-700 bg-neutral-800/60 hover:border-neutral-500"
        }`}>
          {selected && <Check className="w-2.5 h-2.5 text-[#e8ff47]" />}
        </span>
      </label>

      <TaskNameCell
        task={task}
        indent
        onOpen={() => onClick(task)}
        onRename={(title) => onRename(task.id, title)}
      />

      <PriorityFlag
        priority={task.priority ?? "low"}
        onChange={(next) => {
          updateTask(task.id, { priority: next }).then(onUpdate);
        }}
      />

      <InlineAssigneeSelect task={task} onUpdate={onUpdate} />
      <InlineDateInput task={task} onUpdate={onUpdate} />
      <span className="text-xs text-neutral-700">—</span>

      <button
        type="button"
        onClick={handleDelete}
        onPointerDown={cancelDrag}
        className="opacity-0 group-hover:opacity-100 text-neutral-700 hover:text-red-400 transition-all p-1.5 rounded justify-self-end cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function SortableTaskRow({
  task,
  currentMilestoneId,
  milestones,
  onUpdate,
  onDelete,
  onClick,
  onPhaseChange,
  onRename,
  onAddSubtask,
  selected,
  onToggleSelect,
}: {
  task: Task;
  currentMilestoneId: string;
  milestones: Milestone[];
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
  onClick: (t: Task) => void;
  onPhaseChange: (taskId: string, fromMilestoneId: string, toMilestoneId: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onAddSubtask: () => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: "task", milestoneId: task.milestone_id } });

  const style = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0 : 1,
  };

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete(task.id);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${TASK_ROW_GRID} px-3 py-1.5 rounded-lg hover:bg-neutral-900/50 transition-colors group ${selected ? "bg-[#e8ff47]/[0.06] ring-1 ring-[#e8ff47]/20" : ""}`}
    >
      <label
        className={`flex items-center justify-center cursor-pointer transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={cancelDrag}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(task.id)}
          className="sr-only"
        />
        <span className={`flex items-center justify-center w-3.5 h-3.5 rounded border transition-colors cursor-pointer ${
          selected
            ? "border-[#e8ff47]/50 bg-[#e8ff47]/15"
            : "border-neutral-700 bg-neutral-800/60 hover:border-neutral-500"
        }`}>
          {selected && <Check className="w-2.5 h-2.5 text-[#e8ff47]" />}
        </span>
      </label>

      <div
        className="min-w-0 flex items-center cursor-grab active:cursor-grabbing touch-none"
        {...listeners}
        {...attributes}
      >
        <TaskNameCell
          task={task}
          allowSubtasks
          onOpen={() => onClick(task)}
          onRename={(title) => onRename(task.id, title)}
          onAddSubtask={onAddSubtask}
        />
      </div>

      <PriorityFlag
        priority={task.priority ?? "low"}
        onChange={(next) => {
          updateTask(task.id, { priority: next }).then(onUpdate);
        }}
      />

      <InlineAssigneeSelect task={task} onUpdate={onUpdate} />
      <InlineDateInput task={task} onUpdate={onUpdate} />

      <InlinePhaseSelect
        task={task}
        currentMilestoneId={currentMilestoneId}
        milestones={milestones}
        onPhaseChange={onPhaseChange}
      />

      <button
        type="button"
        onClick={handleDelete}
        onPointerDown={cancelDrag}
        className="opacity-0 group-hover:opacity-100 text-neutral-700 hover:text-red-400 transition-all p-1.5 rounded justify-self-end cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function TaskWithSubtasks({
  task,
  subtasks,
  projectId,
  currentMilestoneId,
  milestones,
  onUpdate,
  onDelete,
  onClick,
  onPhaseChange,
  onRename,
  onTaskAdd,
  selectedIds,
  onToggleSelect,
}: {
  task: Task;
  subtasks: Task[];
  projectId: string;
  currentMilestoneId: string;
  milestones: Milestone[];
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
  onClick: (t: Task) => void;
  onPhaseChange: (taskId: string, fromMilestoneId: string, toMilestoneId: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onTaskAdd: (t: Task) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");

  async function submitSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!subtaskTitle.trim()) return;
    const newTask = await createTask(projectId, {
      title: subtaskTitle.trim(),
      parent_id: task.id,
      milestone_id: task.milestone_id ?? undefined,
      position: subtasks.length,
    });
    onTaskAdd(newTask);
    setSubtaskTitle("");
    setAddingSubtask(false);
  }

  return (
    <div>
      <SortableTaskRow
        task={task}
        currentMilestoneId={currentMilestoneId}
        milestones={milestones}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onClick={onClick}
        onPhaseChange={onPhaseChange}
        onRename={onRename}
        onAddSubtask={() => setAddingSubtask(true)}
        selected={selectedIds.has(task.id)}
        onToggleSelect={onToggleSelect}
      />
      {subtasks.map((subtask) => (
        <SubtaskRow
          key={subtask.id}
          task={subtask}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onClick={onClick}
          onRename={onRename}
          selected={selectedIds.has(subtask.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
      {addingSubtask && (
        <form onSubmit={submitSubtask} className={`${TASK_ROW_GRID} px-3 py-1.5 items-center`}>
          <span />
          <Input
            autoFocus
            value={subtaskTitle}
            onChange={(e) => setSubtaskTitle(e.target.value)}
            placeholder="Subtask name..."
            onPointerDown={cancelDrag}
            className="h-7 text-xs bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 ml-5 flex-1 min-w-0"
          />
          <span />
          <span />
          <span />
          <span />
          <div className="flex items-center gap-1 justify-self-end">
            <Button type="submit" size="sm" className="h-7 text-xs bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 px-2">
              <Check className="w-3 h-3" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-neutral-600 hover:text-neutral-400 px-2"
              onClick={() => { setAddingSubtask(false); setSubtaskTitle(""); }}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function findTaskInState(tasksByMilestone: TasksByMilestone, taskId: string): Task | null {
  for (const tasks of Object.values(tasksByMilestone)) {
    const task = tasks.find((t) => t.id === taskId);
    if (task) return task;
  }
  return null;
}

function BulkActionsBar({
  count,
  milestones,
  projects,
  currentProjectId,
  onBulkPhaseChange,
  onBulkProjectMove,
  onBulkUpdate,
  onClear,
}: {
  count: number;
  milestones: Milestone[];
  projects: Project[];
  currentProjectId: string;
  onBulkPhaseChange: (milestoneId: string) => void;
  onBulkProjectMove: (projectId: string) => void | Promise<void>;
  onBulkUpdate: (patch: Partial<Task>) => void;
  onClear: () => void;
}) {
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  if (count === 0) return null;

  const otherProjects = projects.filter((p) => p.id !== currentProjectId);

  async function confirmProjectMove() {
    if (!pendingProjectId || moving) return;
    setMoving(true);
    try {
      await onBulkProjectMove(pendingProjectId);
      setPendingProjectId(null);
    } finally {
      setMoving(false);
    }
  }

  function handleClear() {
    setPendingProjectId(null);
    onClear();
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-neutral-900 border border-neutral-700 rounded-xl px-5 py-3 shadow-2xl shadow-black/60 animate-in slide-in-from-bottom-4 fade-in duration-200">
      <span className="text-sm font-medium text-[#e8ff47] tabular-nums whitespace-nowrap">
        {count} task{count !== 1 ? "s" : ""} selected
      </span>

      <div className="w-px h-5 bg-neutral-700" />

      <Select onValueChange={(v: string | null) => { if (v) onBulkPhaseChange(v); }}>
        <SelectTrigger
          size="sm"
          className="h-8 w-auto min-w-[120px] text-xs bg-neutral-800 border-neutral-700 text-neutral-300 gap-1.5"
          onPointerDown={cancelDrag}
        >
          <FolderKanban className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
          <SelectValue placeholder="Phase" />
        </SelectTrigger>
        <SelectContent className="bg-neutral-800 border-neutral-700">
          {milestones.map((m) => {
            const color = resolvePhaseColor(m.name, m.color);
            return (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span style={{ color }}>{m.name}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {otherProjects.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Select
            value={pendingProjectId ?? undefined}
            onValueChange={(v: string | null) => setPendingProjectId(v || null)}
          >
            <SelectTrigger
              size="sm"
              className="h-8 w-auto min-w-[160px] max-w-[220px] text-xs bg-neutral-800 border-neutral-700 text-neutral-300 gap-1.5"
              onPointerDown={cancelDrag}
            >
              <FolderInput className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <SelectValue placeholder="Move to project" />
            </SelectTrigger>
            <SelectContent
              alignItemWithTrigger={false}
              align="start"
              className="bg-neutral-800 border-neutral-700 max-h-60 min-w-[min(360px,90vw)] w-max"
            >
              {otherProjects.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs text-neutral-100">
                  <span className="whitespace-normal">{p.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pendingProjectId && (
            <Button
              type="button"
              size="sm"
              disabled={moving}
              className="h-8 text-xs bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium px-3 shrink-0"
              onClick={confirmProjectMove}
            >
              {moving ? "Moving…" : "Move"}
            </Button>
          )}
        </div>
      )}

      <Select
        onValueChange={(v: string | null) =>
          onBulkUpdate({ assignee: !v || v === "none" ? null : v })
        }
      >
        <SelectTrigger
          size="sm"
          className="h-8 w-auto min-w-[120px] text-xs bg-neutral-800 border-neutral-700 text-neutral-300 gap-1.5"
          onPointerDown={cancelDrag}
        >
          <Users className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
          <SelectValue placeholder="Assignee" />
        </SelectTrigger>
        <SelectContent className="bg-neutral-800 border-neutral-700">
          <SelectItem value="none" className="text-neutral-500 text-xs">Nobody</SelectItem>
          {TASK_ASSIGNEES.map((name) => (
            <SelectItem key={name} value={name} className="text-neutral-100 text-xs">{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs bg-neutral-800 border border-neutral-700 text-neutral-300 cursor-pointer hover:border-neutral-600 transition-colors">
        <Calendar className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        <input
          type="date"
          className="bg-transparent border-none outline-none text-xs text-neutral-300 cursor-pointer w-[110px] font-mono"
          onChange={(e) => {
            if (e.target.value) onBulkUpdate({ due_date: e.target.value });
          }}
        />
      </label>

      <div className="w-px h-5 bg-neutral-700" />

      <button
        onClick={handleClear}
        className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-200 transition-colors px-2 py-1.5 rounded hover:bg-neutral-800"
      >
        <X className="w-3.5 h-3.5" />
        Clear
      </button>
    </div>
  );
}

function AddTaskInline({
  onAdd,
  projectId,
  milestoneId,
}: {
  onAdd: (t: Task) => void;
  projectId: string;
  milestoneId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const task = await createTask(projectId, { title: title.trim(), milestone_id: milestoneId });
    onAdd(task);
    setTitle("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-xs text-neutral-700 hover:text-neutral-400 transition-colors px-3 py-1.5 w-full">
        <Plus className="w-3.5 h-3.5" /> Add task
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-3 py-1.5">
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Task description..."
        className="h-7 text-xs bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 flex-1" />
      <Button type="submit" size="sm"
        className="h-7 text-xs bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 px-2">
        <Check className="w-3 h-3" />
      </Button>
      <Button type="button" size="sm" variant="ghost"
        className="h-7 text-xs text-neutral-600 hover:text-neutral-400 px-2"
        onClick={() => { setOpen(false); setTitle(""); }}>
        <X className="w-3 h-3" />
      </Button>
    </form>
  );
}

function MilestoneSection({
  milestone,
  milestones,
  projectId,
  tasks,
  onDelete,
  onTaskUpdate,
  onTaskDelete,
  onTaskAdd,
  onTaskClick,
  onPhaseChange,
  isUnassigned,
  selectedIds,
  onToggleSelect,
  onTogglePhase,
  onRename,
}: {
  milestone: Milestone;
  milestones: Milestone[];
  projectId: string;
  tasks: Task[];
  onDelete: (id: string) => void;
  onTaskUpdate: (t: Task) => void;
  onTaskDelete: (id: string) => void;
  onTaskAdd: (t: Task) => void;
  onTaskClick: (t: Task) => void;
  onPhaseChange: (taskId: string, fromMilestoneId: string, toMilestoneId: string) => void;
  isUnassigned?: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onTogglePhase: (taskIds: string[]) => void;
  onRename: (id: string, title: string) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: milestone.id });

  const pendingTasks = tasks.filter((t) => !isApprovedTask(t));
  const approvedTasks = sortByPosition(tasks.filter(isApprovedTask));
  const approvedTopLevel = sortByPosition(tasks.filter(isTopLevelTask));
  const subtasksByParent = groupSubtasksByParent(tasks);
  const total = approvedTopLevel.length;
  const titleColor = isUnassigned
    ? "#a3a3a3"
    : resolvePhaseColor(milestone.name, milestone.color);

  const approvedIds = approvedTasks.map((t) => t.id);
  const allPhaseSelected = total > 0 && approvedIds.every((id) => selectedIds.has(id));
  const somePhaseSelected = approvedIds.some((id) => selectedIds.has(id));

  function handleApprove(id: string) {
    updateTask(id, { approved: true }).then(onTaskUpdate);
  }

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${
      isUnassigned
        ? "border-amber-900/50 bg-amber-950/10"
        : "border-neutral-800"
    } ${isOver ? "border-[#e8ff47]/30 bg-[#e8ff47]/[0.02]" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-3 bg-neutral-900/60 border-b border-neutral-800 group/phase">
        <label
          className={`flex items-center justify-center cursor-pointer transition-opacity ${
            somePhaseSelected || allPhaseSelected ? "opacity-100" : "opacity-0 group-hover/phase:opacity-100"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={allPhaseSelected}
            onChange={() => onTogglePhase(approvedIds)}
            className="sr-only"
            disabled={total === 0}
          />
          <span className={`flex items-center justify-center w-3.5 h-3.5 rounded border transition-colors cursor-pointer ${
            allPhaseSelected
              ? "border-[#e8ff47]/50 bg-[#e8ff47]/15"
              : somePhaseSelected
                ? "border-[#e8ff47]/30 bg-[#e8ff47]/5"
                : "border-neutral-700 bg-neutral-800/60 hover:border-neutral-500"
          }`}>
            {allPhaseSelected && <Check className="w-2.5 h-2.5 text-[#e8ff47]" />}
            {somePhaseSelected && !allPhaseSelected && <span className="w-1.5 h-0.5 rounded-full bg-[#e8ff47]/60" />}
          </span>
        </label>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: titleColor }}
          />
          <h3 className="font-medium truncate" style={{ color: titleColor }}>
            {milestone.name}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {!isUnassigned && pendingTasks.length > 0 && (
            <span className="text-xs text-orange-400">{pendingTasks.length} request{pendingTasks.length !== 1 ? "s" : ""}</span>
          )}
          <span className="text-xs text-neutral-600 font-mono">{total} task{total !== 1 ? "s" : ""}</span>
          {!isUnassigned && milestone.due_date && (
            <span className="text-xs text-neutral-700 font-mono">{formatDate(milestone.due_date)}</span>
          )}
          {!isUnassigned && (
            <button onClick={() => onDelete(milestone.id)}
              className="text-neutral-700 hover:text-red-400 transition-colors p-1 rounded hover:bg-neutral-800">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {pendingTasks.map((task) => (
        <PendingTaskRow
          key={task.id}
          task={task}
          onDelete={onTaskDelete}
          onApprove={handleApprove}
        />
      ))}

      <div ref={setNodeRef} className="min-h-[2rem]">
        <SortableContext items={approvedTopLevel.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-neutral-800/40">
            {approvedTopLevel.map((task) => (
              <TaskWithSubtasks
                key={task.id}
                task={task}
                subtasks={subtasksByParent.get(task.id) ?? []}
                projectId={projectId}
                currentMilestoneId={milestone.id}
                milestones={milestones}
                onUpdate={onTaskUpdate}
                onDelete={onTaskDelete}
                onClick={onTaskClick}
                onPhaseChange={onPhaseChange}
                onRename={onRename}
                onTaskAdd={onTaskAdd}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        </SortableContext>
        {approvedTopLevel.length === 0 && pendingTasks.length === 0 && (
          <p className="text-xs text-neutral-700 px-4 py-3">Drop tasks here</p>
        )}
      </div>

      <AddTaskInline onAdd={onTaskAdd} projectId={projectId} milestoneId={isUnassigned ? undefined : milestone.id} />
    </div>
  );
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tasksByMilestone, setTasksByMilestone] = useState<TasksByMilestone>({});
  const [loading, setLoading] = useState(true);
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [newMilestoneColor, setNewMilestoneColor] = useState(CUSTOM_PHASE_DEFAULT_COLOR);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [copied, setCopied] = useState(false);
  const { requestDelete, confirmDialog } = useConfirmDelete();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editStatusesOpen, setEditStatusesOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const { filters, addFilter, updateFilter, removeFilter, clearFilters } = useTaskFilters();
  const tasksRef = useRef<TasksByMilestone>({});

  const milestoneIds = [
    ...(project?.milestones.map((m) => m.id) ?? []),
    ...(tasksByMilestone[UNASSIGNED_ID]?.length ? [UNASSIGNED_ID] : []),
  ];

  useEffect(() => {
    tasksRef.current = tasksByMilestone;
  }, [tasksByMilestone]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    getProject(id).then((p) => {
      const detail = p as ProjectDetail;
      setProject(detail);
      setTasksByMilestone(buildTasksByMilestone(detail.milestones, detail.unassigned_tasks || []));
      setLoading(false);
    });
    getProjects().then(setAllProjects);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const persistContainer = useCallback(async (containerId: string, tasks: Task[]) => {
    const approved = sortByPosition(tasks.filter(isApprovedTask));
    const topLevel = approved.filter((t) => !t.parent_id);
    const subtasks = approved.filter((t) => t.parent_id);
    const milestoneId = containerToMilestoneId(containerId);

    await Promise.all([
      ...topLevel.map((t, i) =>
        updateTask(t.id, {
          milestone_id: milestoneId,
          position: i,
        }),
      ),
      ...subtasks.map((t) =>
        updateTask(t.id, {
          milestone_id: milestoneId,
        }),
      ),
    ]);
  }, []);

  function handleTaskUpdate(updated: Task) {
    setTasksByMilestone((prev) => {
      const next = { ...prev };
      let oldContainer: string | null = null;
      for (const containerId of Object.keys(next)) {
        if (next[containerId].some((t) => t.id === updated.id)) {
          oldContainer = containerId;
          break;
        }
      }
      const newContainer = updated.milestone_id ?? UNASSIGNED_ID;

      if (oldContainer) {
        next[oldContainer] = next[oldContainer].filter((t) => t.id !== updated.id);
      }

      if (isApprovedTask(updated)) {
        next[newContainer] = sortByPosition([
          ...(next[newContainer] || []).filter((t) => t.id !== updated.id),
          updated,
        ]);
      } else if (oldContainer) {
        next[oldContainer] = sortByPosition([...(next[oldContainer] || []), updated]);
      }

      if (next[UNASSIGNED_ID]?.length === 0) {
        delete next[UNASSIGNED_ID];
      }

      return next;
    });
    if (selectedTask?.id === updated.id) setSelectedTask(updated);
  }

  function confirmTaskDelete(taskId: string) {
    const task = findTaskInState(tasksRef.current, taskId);
    const childCount = getChildTasks(tasksRef.current, taskId).length;
    requestDelete({
      title: "Delete task",
      description: (
        <>
          Are you sure you want to delete{" "}
          <span className="text-neutral-300">{task?.title ?? "this task"}</span>?
          {childCount > 0 && (
            <> This will also delete {childCount} subtask{childCount !== 1 ? "s" : ""}.</>
          )}
        </>
      ),
      confirmLabel: "Delete task",
      onConfirm: () => handleTaskDelete(taskId),
    });
  }

  function confirmMilestoneDelete(milestoneId: string) {
    const milestone = project?.milestones.find((m) => m.id === milestoneId);
    const taskCount = (tasksByMilestone[milestoneId] || []).length;
    requestDelete({
      title: "Delete phase",
      description: (
        <>
          Are you sure you want to delete{" "}
          <span className="text-neutral-300">{milestone?.name ?? "this phase"}</span>?
          {taskCount > 0 && (
            <> This will permanently remove {taskCount} task{taskCount !== 1 ? "s" : ""} in this phase.</>
          )}
        </>
      ),
      confirmLabel: "Delete phase",
      onConfirm: async () => {
        await deleteMilestone(milestoneId);
        setProject((prev) => prev ? {
          ...prev,
          milestones: prev.milestones.filter((ms) => ms.id !== milestoneId),
        } : prev);
        setTasksByMilestone((prev) => {
          const next = { ...prev };
          delete next[milestoneId];
          return next;
        });
      },
    });
  }

  function handleTaskDelete(taskId: string) {
    const childIds = getChildTasks(tasksRef.current, taskId).map((c) => c.id);
    const idsToRemove = new Set([taskId, ...childIds]);
    deleteTask(taskId);
    setTasksByMilestone((prev) => {
      const next = { ...prev };
      for (const milestoneId of Object.keys(next)) {
        next[milestoneId] = next[milestoneId].filter((t) => !idsToRemove.has(t.id));
      }
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of idsToRemove) next.delete(id);
      return next;
    });
    if (selectedTask && idsToRemove.has(selectedTask.id)) {
      setDetailOpen(false);
      setSelectedTask(null);
    }
  }

  function handleTaskAdd(containerId: string, task: Task) {
    const bucket = task.milestone_id ?? UNASSIGNED_ID;
    setTasksByMilestone((prev) => ({
      ...prev,
      [bucket]: sortByPosition([...(prev[bucket] || []), task]),
    }));
  }

  async function handleTaskPhaseChange(taskId: string, fromMilestoneId: string, toMilestoneId: string) {
    const current = tasksRef.current;
    const childTasks = getChildTasks(current, taskId);
    const targetApproved = (current[toMilestoneId] || []).filter(isTopLevelTask);
    const newPosition = targetApproved.length;

    const updated = await updateTask(taskId, {
      milestone_id: toMilestoneId,
      position: newPosition,
    });
    const updatedChildren = await Promise.all(
      childTasks.map((child) =>
        updateTask(child.id, { milestone_id: toMilestoneId }),
      ),
    );

    setTasksByMilestone((prev) => {
      const movingIds = new Set([taskId, ...childTasks.map((c) => c.id)]);
      const fromPending = (prev[fromMilestoneId] || []).filter((t) => !isApprovedTask(t));
      const fromApproved = (prev[fromMilestoneId] || []).filter((t) => isApprovedTask(t) && !movingIds.has(t.id));
      const toPending = (prev[toMilestoneId] || []).filter((t) => !isApprovedTask(t));
      const toApproved = [
        ...targetApproved,
        updated,
        ...updatedChildren,
      ];

      const next = {
        ...prev,
        [fromMilestoneId]: [...fromPending, ...fromApproved],
        [toMilestoneId]: [...toPending, ...toApproved],
      };
      tasksRef.current = next;
      return next;
    });

    const fromApproved = (tasksRef.current[fromMilestoneId] || []).filter(isApprovedTask);
    const toApproved = (tasksRef.current[toMilestoneId] || []).filter(isApprovedTask);
    await Promise.all([
      persistContainer(fromMilestoneId, fromApproved),
      persistContainer(toMilestoneId, toApproved),
    ]);

    if (selectedTask?.id === taskId) setSelectedTask(updated);
  }

  async function handleRename(taskId: string, title: string) {
    const updated = await updateTask(taskId, { title });
    handleTaskUpdate(updated);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeContainer = findContainer(String(active.id), tasksByMilestone, milestoneIds);
    const overContainer = findContainer(String(over.id), tasksByMilestone, milestoneIds);
    if (!activeContainer || !overContainer) return;

    if (activeContainer === overContainer) {
      setTasksByMilestone((prev) => {
        const reordered = reorderTopLevelInContainer(
          prev[activeContainer],
          String(active.id),
          String(over.id),
          milestoneIds,
        );
        if (!reordered) return prev;
        const next = { ...prev, [activeContainer]: reordered };
        tasksRef.current = next;
        return next;
      });
      return;
    }

    setTasksByMilestone((prev) => {
      const activeItems = prev[activeContainer].filter(isApprovedTask);
      const overItems = prev[overContainer].filter(isApprovedTask);
      const activeIndex = activeItems.findIndex((t) => t.id === active.id);
      if (activeIndex === -1) return prev;

      const task = activeItems[activeIndex];
      if (task.parent_id) return prev;

      const childTasks = activeItems.filter((t) => t.parent_id === task.id);
      const movingIds = new Set([task.id, ...childTasks.map((c) => c.id)]);
      const overTopLevel = overItems.filter(isTopLevelTask);
      const overIndexTop = milestoneIds.includes(String(over.id))
        ? overTopLevel.length
        : overTopLevel.findIndex((t) => t.id === over.id);

      const newMilestoneId = containerToMilestoneId(overContainer);
      const movingTasks = activeItems
        .filter((t) => movingIds.has(t.id))
        .map((t) => ({ ...t, milestone_id: newMilestoneId }));
      const parentTask = movingTasks.find((t) => t.id === task.id)!;
      const movedChildren = movingTasks.filter((t) => t.parent_id === task.id);

      const pendingInActive = prev[activeContainer].filter((t) => !isApprovedTask(t));
      const pendingInOver = prev[overContainer].filter((t) => !isApprovedTask(t));
      const newActiveApproved = activeItems.filter((t) => !movingIds.has(t.id));

      const remainingOver = overItems.filter((t) => !movingIds.has(t.id));
      const remainingOverTop = remainingOver.filter(isTopLevelTask);
      const remainingOverSub = remainingOver.filter((t) => t.parent_id);
      const insertAt = overIndexTop >= 0 ? overIndexTop : remainingOverTop.length;
      const newOverTop = [
        ...remainingOverTop.slice(0, insertAt),
        parentTask,
        ...remainingOverTop.slice(insertAt),
      ];
      const newOverApproved = [...newOverTop, ...remainingOverSub, ...movedChildren];

      const next = {
        ...prev,
        [activeContainer]: [...pendingInActive, ...newActiveApproved],
        [overContainer]: [...pendingInOver, ...newOverApproved],
      };
      tasksRef.current = next;
      return next;
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const current = tasksRef.current;
    const activeContainer = findContainer(String(active.id), current, milestoneIds);
    const overContainer = findContainer(String(over.id), current, milestoneIds);
    if (!activeContainer || !overContainer) return;

    let nextState = current;

    if (activeContainer === overContainer) {
      const reordered = reorderTopLevelInContainer(
        current[activeContainer],
        String(active.id),
        String(over.id),
        milestoneIds,
      );
      if (reordered) {
        nextState = { ...current, [activeContainer]: reordered };
        setTasksByMilestone(nextState);
        tasksRef.current = nextState;
      }
    }

    const activeApproved = sortByPosition(
      (nextState[activeContainer] || []).filter(isApprovedTask),
    );
    const overApproved = sortByPosition(
      (nextState[overContainer] || []).filter(isApprovedTask),
    );

    await Promise.all([
      persistContainer(activeContainer, activeApproved),
      activeContainer !== overContainer ? persistContainer(overContainer, overApproved) : Promise.resolve(),
    ]);
  }

  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!newMilestoneName.trim() || !project) return;
    setAddingMilestone(true);
    const milestone = await createMilestone(project.id, {
      name: newMilestoneName.trim(),
      position: project.milestones.length,
      color: newMilestoneColor || defaultColorForPhaseName(newMilestoneName.trim()),
    });
    setProject((prev) => prev ? {
      ...prev,
      milestones: [...prev.milestones, { ...milestone, tasks: [] }],
    } : prev);
    setTasksByMilestone((prev) => ({ ...prev, [milestone.id]: [] }));
    setNewMilestoneName("");
    setNewMilestoneColor(CUSTOM_PHASE_DEFAULT_COLOR);
    setAddingMilestone(false);
  }

  function handleStatusesSaved(updated: Milestone[]) {
    if (!project) return;
    const withTasks = updated.map((m) => ({
      ...m,
      tasks: (tasksByMilestone[m.id] || []),
    }));
    setProject((prev) =>
      prev ? { ...prev, milestones: withTasks } : prev,
    );
    const removedIds = new Set(
      project.milestones.map((m) => m.id).filter((id) => !updated.some((u) => u.id === id)),
    );
    if (removedIds.size > 0) {
      setTasksByMilestone((prev) => {
        const next = { ...prev };
        const orphaned: Task[] = [];
        for (const id of removedIds) {
          if (next[id]) {
            orphaned.push(...next[id]);
            delete next[id];
          }
        }
        if (orphaned.length > 0) {
          next[UNASSIGNED_ID] = [...(next[UNASSIGNED_ID] || []), ...orphaned];
        }
        for (const m of updated) {
          if (!next[m.id]) next[m.id] = [];
        }
        return next;
      });
    } else {
      setTasksByMilestone((prev) => {
        const next = { ...prev };
        for (const m of updated) {
          if (!next[m.id]) next[m.id] = [];
        }
        return next;
      });
    }
  }

  function copyShareLink() {
    if (!project) return;
    navigator.clipboard.writeText(`${window.location.origin}/project/${project.share_token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function requestDeleteProject() {
    if (!project) return;
    requestDelete({
      title: "Delete project",
      description: (
        <>
          Are you sure you want to delete <span className="text-neutral-300">{project.name}</span>?
          This will permanently remove all phases, tasks, and the client share link.
        </>
      ),
      confirmLabel: "Delete project",
      onConfirm: async () => {
        await deleteProject(project.id);
        router.push("/projects");
      },
    });
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-48 bg-neutral-800 rounded animate-pulse" />
        <div className="h-40 bg-neutral-800 rounded animate-pulse" />
      </div>
    );
  }

  if (!project) return <div className="p-8 text-neutral-600">Project not found</div>;

  const allTasks = Object.values(tasksByMilestone).flat();
  const approvedTasksAll = allTasks.filter(isApprovedTask);
  const pendingRequests = allTasks.filter((t) => !isApprovedTask(t)).length;
  const hasApprovedTasks = approvedTasksAll.length > 0;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePhaseSelect(taskIds: string[]) {
    setSelectedIds((prev) => {
      const allSelected = taskIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        for (const id of taskIds) next.delete(id);
      } else {
        for (const id of taskIds) next.add(id);
      }
      return next;
    });
  }

  async function handleBulkUpdate(patch: Partial<Task>) {
    const ids = Array.from(selectedIds);
    const updates = await Promise.all(
      ids.map((taskId) => updateTask(taskId, patch)),
    );
    for (const u of updates) handleTaskUpdate(u);
    setSelectedIds(new Set());
  }

  async function handleBulkPhaseChange(toMilestoneId: string) {
    const ids = Array.from(selectedIds);
    const updates = await Promise.all(
      ids.map((taskId) =>
        updateTask(taskId, { milestone_id: toMilestoneId }),
      ),
    );
    for (const u of updates) handleTaskUpdate(u);
    setSelectedIds(new Set());
  }

  async function handleBulkProjectMove(targetProjectId: string) {
    if (!project) return;

    const target = (await getProject(targetProjectId)) as ProjectDetail;
    const targetMilestoneByName = new Map(
      target.milestones.map((m) => [m.name.toLowerCase(), m.id]),
    );
    const sourceMilestoneById = new Map(project.milestones.map((m) => [m.id, m]));

    const idsToMove = new Set<string>();
    for (const taskId of selectedIds) {
      idsToMove.add(taskId);
      const task = findTaskInState(tasksRef.current, taskId);
      if (task && !task.parent_id) {
        for (const child of getChildTasks(tasksRef.current, taskId)) {
          idsToMove.add(child.id);
        }
      }
    }

    const resolveTargetMilestone = (task: Task): string | null => {
      if (!task.milestone_id) return null;
      const sourceName = sourceMilestoneById.get(task.milestone_id)?.name;
      if (!sourceName) return null;
      return targetMilestoneByName.get(sourceName.toLowerCase()) ?? null;
    };

    await Promise.all(
      Array.from(idsToMove).map((taskId) => {
        const task = findTaskInState(tasksRef.current, taskId);
        if (!task) return Promise.resolve();
        return updateTask(taskId, {
          project_id: targetProjectId,
          milestone_id: resolveTargetMilestone(task),
        });
      }),
    );

    setTasksByMilestone((prev) => {
      const next = { ...prev };
      for (const milestoneId of Object.keys(next)) {
        next[milestoneId] = next[milestoneId].filter((t) => !idsToMove.has(t.id));
        if (next[milestoneId].length === 0 && milestoneId === UNASSIGNED_ID) {
          delete next[milestoneId];
        }
      }
      return next;
    });

    if (selectedTask && idsToMove.has(selectedTask.id)) {
      setDetailOpen(false);
      setSelectedTask(null);
    }

    setSelectedIds(new Set());
  }

  return (
    <div className="w-full p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/projects" className="text-neutral-600 hover:text-neutral-300 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        {(project.company as { logo_url?: string; name?: string })?.name && (
          <CompanyAvatar
            name={(project.company as { name?: string }).name!}
            logoUrl={(project.company as { logo_url?: string }).logo_url}
            size="lg"
          />
        )}
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-neutral-100">{project.name}</h1>
          <p className="text-sm text-neutral-600 mt-0.5">
            {(project.company as { name?: string })?.name || "—"}
            {project.client_name && ` · ${project.client_name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger
              className={`flex items-center gap-2 text-xs border px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                filters.length > 0
                  ? "border-[#e8ff47]/30 text-[#e8ff47] hover:border-[#e8ff47]/50"
                  : "border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter{filters.filter((f) => f.value).length > 0 && ` (${filters.filter((f) => f.value).length})`}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto min-w-[320px] p-3">
              <TaskFilterBar
                filters={filters}
                milestones={project.milestones}
                onAddFilter={addFilter}
                onUpdateFilter={updateFilter}
                onRemoveFilter={removeFilter}
                onClearFilters={clearFilters}
              />
            </PopoverContent>
          </Popover>
          <button
            onClick={() => setEditStatusesOpen(true)}
            className="flex items-center gap-2 text-xs border border-neutral-700 px-3 py-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit statuses
          </button>
          <button
            onClick={copyShareLink}
            className="flex items-center gap-2 text-xs border border-neutral-700 px-3 py-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Share client link"}
          </button>
          <button
            onClick={requestDeleteProject}
            className="flex items-center justify-center text-xs border border-neutral-700 p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:border-red-900/50 transition-colors"
            aria-label="Delete project"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {confirmDialog}

      {pendingRequests > 0 && (
        <div className="flex items-center gap-3 bg-orange-950/40 border border-orange-900/50 rounded-lg px-4 py-3">
          <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0" />
          <p className="text-sm text-orange-300">
            <span className="font-medium">{pendingRequests} task request{pendingRequests !== 1 ? "s" : ""}</span> from the client awaiting approval
          </p>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-3">
          {hasApprovedTasks && (
            <div className="px-3">
              <TaskColumnHeader />
            </div>
          )}
          {(tasksByMilestone[UNASSIGNED_ID]?.length ?? 0) > 0 && (
            <MilestoneSection
              key={UNASSIGNED_ID}
              isUnassigned
              milestone={{
                id: UNASSIGNED_ID,
                project_id: project.id,
                name: "Unassigned",
                position: -1,
                status: "pending",
                tasks: [],
                created_at: "",
                updated_at: "",
              }}
              milestones={project.milestones}
              projectId={project.id}
              tasks={applyTaskFilters(tasksByMilestone[UNASSIGNED_ID] || [], filters, project.milestones)}
              onDelete={() => {}}
              onTaskUpdate={handleTaskUpdate}
              onTaskDelete={confirmTaskDelete}
              onTaskAdd={(t) => handleTaskAdd(UNASSIGNED_ID, t)}
              onTaskClick={(t) => { setSelectedTask(t); setDetailOpen(true); }}
              onPhaseChange={handleTaskPhaseChange}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onTogglePhase={togglePhaseSelect}
              onRename={handleRename}
            />
          )}
          {project.milestones.map((milestone) => {
            const filteredTasks = applyTaskFilters(tasksByMilestone[milestone.id] || [], filters, project.milestones);
            return (
              <MilestoneSection
                key={milestone.id}
                milestone={milestone}
                milestones={project.milestones}
                projectId={project.id}
                tasks={filteredTasks}
                onDelete={confirmMilestoneDelete}
                onTaskUpdate={handleTaskUpdate}
                onTaskDelete={confirmTaskDelete}
                onTaskAdd={(t) => handleTaskAdd(milestone.id, t)}
                onTaskClick={(t) => { setSelectedTask(t); setDetailOpen(true); }}
                onPhaseChange={handleTaskPhaseChange}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onTogglePhase={togglePhaseSelect}
                onRename={handleRename}
              />
            );
          })}
        </div>
      </DndContext>

      <TaskDetailDialog
        task={selectedTask}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSave={handleTaskUpdate}
      />

      <form onSubmit={handleAddMilestone} className="flex items-center gap-3">
        <PhaseColorInput
          value={newMilestoneColor}
          onChange={setNewMilestoneColor}
        />
        <Input
          value={newMilestoneName}
          onChange={(e) => setNewMilestoneName(e.target.value)}
          placeholder="Add new phase... (e.g. Discovery, Design, Build)"
          className="bg-neutral-900 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 flex-1"
        />
        <Button type="submit" disabled={addingMilestone || !newMilestoneName.trim()}
          className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Phase
        </Button>
      </form>

      <EditStatusesDialog
        open={editStatusesOpen}
        onOpenChange={setEditStatusesOpen}
        projectId={project.id}
        milestones={project.milestones}
        onSave={handleStatusesSaved}
      />

      <BulkActionsBar
        count={selectedIds.size}
        milestones={project.milestones}
        projects={allProjects}
        currentProjectId={id}
        onBulkPhaseChange={handleBulkPhaseChange}
        onBulkProjectMove={handleBulkProjectMove}
        onBulkUpdate={handleBulkUpdate}
        onClear={() => setSelectedIds(new Set())}
      />
    </div>
  );
}

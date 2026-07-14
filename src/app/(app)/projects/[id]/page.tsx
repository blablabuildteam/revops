"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Check, X, Copy, Trash2, GripVertical,
} from "lucide-react";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getProject, createMilestone, createTask, updateTask, deleteTask, updateMilestone, deleteMilestone, deleteProject } from "@/lib/api";
import { Project, Milestone, Task, TASK_ASSIGNEES, resolvePhaseColor, defaultColorForPhaseName, CUSTOM_PHASE_DEFAULT_COLOR, PHASE_COLOR_PRESETS } from "@/lib/types";
import { formatDate } from "@/lib/format";

const TASK_ROW_GRID =
  "grid grid-cols-[24px_minmax(0,1fr)_140px_150px_150px_32px] items-center gap-x-4 gap-y-2";

const milestoneStatusColors = {
  pending: "text-neutral-500 bg-neutral-800",
  in_progress: "text-blue-400 bg-blue-950",
  completed: "text-emerald-400 bg-emerald-950",
};

type TasksByMilestone = Record<string, Task[]>;
type ProjectDetail = Project & { milestones: (Milestone & { tasks: Task[] })[]; unassigned_tasks: Task[] };

function sortByPosition(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

function buildTasksByMilestone(milestones: (Milestone & { tasks: Task[] })[]): TasksByMilestone {
  const map: TasksByMilestone = {};
  for (const m of milestones) {
    map[m.id] = sortByPosition(m.tasks || []);
  }
  return map;
}

function findContainer(
  id: string,
  tasksByMilestone: TasksByMilestone,
  milestoneIds: string[],
): string | null {
  if (milestoneIds.includes(id)) return id;
  for (const [milestoneId, tasks] of Object.entries(tasksByMilestone)) {
    if (tasks.some((t) => t.id === id)) return milestoneId;
  }
  return null;
}

function PhaseColorPicker({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (color: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${compact ? "" : "shrink-0"}`} onClick={(e) => e.stopPropagation()}>
      {PHASE_COLOR_PRESETS.map((preset) => (
        <button
          key={preset.value}
          type="button"
          title={preset.label}
          onClick={() => onChange(preset.value)}
          className={`rounded-full border-2 transition-transform hover:scale-110 ${compact ? "w-3.5 h-3.5" : "w-5 h-5"} ${value === preset.value ? "border-white" : "border-neutral-700"}`}
          style={{ backgroundColor: preset.value }}
        />
      ))}
      <label
        title="Custom color"
        className={`relative rounded-full border-2 border-neutral-600 overflow-hidden cursor-pointer hover:scale-110 transition-transform ${compact ? "w-3.5 h-3.5" : "w-5 h-5"}`}
        style={{
          background: value && !PHASE_COLOR_PRESETS.some((p) => p.value === value)
            ? value
            : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
        }}
      >
        <input
          type="color"
          value={value.startsWith("#") && value.length >= 7 ? value : CUSTOM_PHASE_DEFAULT_COLOR}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </label>
    </div>
  );
}

function TaskColumnHeader() {
  return (
    <div className={`${TASK_ROW_GRID} px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-600 border-b border-neutral-800/60`}>
      <span />
      <span>Task</span>
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
    due_date: "",
    assignee: "",
    description: "",
    url: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (task && open) {
      setForm({
        due_date: task.due_date ? task.due_date.slice(0, 10) : "",
        assignee: task.assignee ?? "",
        description: task.description ?? "",
        url: task.url ?? "",
      });
    }
  }, [task, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    setLoading(true);
    try {
      const updated = await updateTask(task.id, {
        due_date: form.due_date || undefined,
        assignee: form.assignee || undefined,
        description: form.description || undefined,
        url: form.url || undefined,
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
          <DialogTitle className="text-neutral-100 pr-6">{task.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
              disabled={loading}
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
        {task.description && <p className="text-xs text-orange-400/60 mt-0.5 truncate">{task.description}</p>}
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
  const value = task.due_date ? task.due_date.slice(0, 10) : "";

  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => {
        updateTask(task.id, { due_date: e.target.value || undefined }).then(onUpdate);
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
  const current = milestones.find((m) => m.id === currentMilestoneId);
  const currentColor = current ? resolvePhaseColor(current.name, current.color) : undefined;

  return (
    <Select
      value={currentMilestoneId}
      onValueChange={(v) => {
        if (!v || v === currentMilestoneId) return;
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
          {current && (
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

function SortableTaskRow({
  task,
  currentMilestoneId,
  milestones,
  onUpdate,
  onDelete,
  onClick,
  onPhaseChange,
}: {
  task: Task;
  currentMilestoneId: string;
  milestones: Milestone[];
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
  onClick: (t: Task) => void;
  onPhaseChange: (taskId: string, fromMilestoneId: string, toMilestoneId: string) => void;
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
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete(task.id);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${TASK_ROW_GRID} px-3 py-1.5 rounded-lg hover:bg-neutral-900/50 transition-colors group cursor-grab active:cursor-grabbing touch-none`}
      {...attributes}
      {...listeners}
    >
      <div className="shrink-0 text-neutral-700 p-0.5 pointer-events-none">
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      <button
        type="button"
        onClick={() => onClick(task)}
        className="min-w-0 text-left"
      >
        <p className="text-sm truncate text-neutral-200">
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-neutral-600 truncate">{task.description}</p>
        )}
      </button>

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
        className="opacity-0 group-hover:opacity-100 text-neutral-700 hover:text-red-400 transition-all p-1 rounded justify-self-end cursor-pointer"
      >
        <Trash2 className="w-3 h-3" />
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
  onCycleStatus,
  onTaskUpdate,
  onTaskDelete,
  onTaskAdd,
  onTaskClick,
  onPhaseChange,
  onColorChange,
}: {
  milestone: Milestone;
  milestones: Milestone[];
  projectId: string;
  tasks: Task[];
  onDelete: (id: string) => void;
  onCycleStatus: () => void;
  onTaskUpdate: (t: Task) => void;
  onTaskDelete: (id: string) => void;
  onTaskAdd: (t: Task) => void;
  onTaskClick: (t: Task) => void;
  onPhaseChange: (taskId: string, fromMilestoneId: string, toMilestoneId: string) => void;
  onColorChange: (milestoneId: string, color: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: milestone.id });
  const [colorOpen, setColorOpen] = useState(false);

  const pendingTasks = tasks.filter((t) => !t.approved);
  const approvedTasks = sortByPosition(tasks.filter((t) => t.approved));
  const total = approvedTasks.length;
  const titleColor = resolvePhaseColor(milestone.name, milestone.color);
  const pickerValue = milestone.color ?? titleColor;

  function handleApprove(id: string) {
    updateTask(id, { approved: true }).then(onTaskUpdate);
  }

  return (
    <div className={`border border-neutral-800 rounded-lg overflow-hidden transition-colors ${isOver ? "border-[#e8ff47]/30 bg-[#e8ff47]/[0.02]" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-3 bg-neutral-900/60 border-b border-neutral-800">
        <button onClick={onCycleStatus}
          className={`text-xs px-2 py-0.5 rounded font-mono cursor-pointer ${milestoneStatusColors[milestone.status]}`}>
          {milestone.status === "pending" ? "Planned" : milestone.status === "in_progress" ? "In progress" : "Completed"}
        </button>
        <div className="flex-1">
          <button
            type="button"
            onClick={() => setColorOpen((open) => !open)}
            className="flex items-center gap-2 font-medium text-left hover:opacity-80 transition-opacity"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: titleColor }}
            />
            <span style={{ color: titleColor }}>{milestone.name}</span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          {pendingTasks.length > 0 && (
            <span className="text-xs text-orange-400">{pendingTasks.length} request{pendingTasks.length !== 1 ? "s" : ""}</span>
          )}
          <span className="text-xs text-neutral-600 font-mono">{total} task{total !== 1 ? "s" : ""}</span>
          {milestone.due_date && (
            <span className="text-xs text-neutral-700 font-mono">{formatDate(milestone.due_date)}</span>
          )}
          <button onClick={() => onDelete(milestone.id)}
            className="text-neutral-700 hover:text-red-400 transition-colors p-1 rounded hover:bg-neutral-800">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {colorOpen && (
        <div
          className="flex items-center gap-2 px-4 py-2 bg-neutral-900/40 border-b border-neutral-800"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[10px] uppercase tracking-wide text-neutral-600 shrink-0">Color</span>
          <PhaseColorPicker
            compact
            value={pickerValue}
            onChange={(color) => {
              onColorChange(milestone.id, color);
              setColorOpen(false);
            }}
          />
        </div>
      )}

      {pendingTasks.map((task) => (
        <PendingTaskRow
          key={task.id}
          task={task}
          onDelete={onTaskDelete}
          onApprove={handleApprove}
        />
      ))}

      <div ref={setNodeRef} className="min-h-[2rem]">
        <SortableContext items={approvedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-neutral-800/40">
            {approvedTasks.map((task) => (
              <SortableTaskRow
                key={task.id}
                task={task}
                currentMilestoneId={milestone.id}
                milestones={milestones}
                onUpdate={onTaskUpdate}
                onDelete={onTaskDelete}
                onClick={onTaskClick}
                onPhaseChange={onPhaseChange}
              />
            ))}
          </div>
        </SortableContext>
        {approvedTasks.length === 0 && pendingTasks.length === 0 && (
          <p className="text-xs text-neutral-700 px-4 py-3">Drop tasks here</p>
        )}
      </div>

      <AddTaskInline onAdd={onTaskAdd} projectId={projectId} milestoneId={milestone.id} />
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const tasksRef = useRef<TasksByMilestone>({});

  const milestoneIds = project?.milestones.map((m) => m.id) ?? [];

  useEffect(() => {
    tasksRef.current = tasksByMilestone;
  }, [tasksByMilestone]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    getProject(id).then((p) => {
      const detail = p as ProjectDetail;
      setProject(detail);
      setTasksByMilestone(buildTasksByMilestone(detail.milestones));
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const persistContainer = useCallback(async (milestoneId: string, tasks: Task[]) => {
    await Promise.all(
      tasks.map((t, i) =>
        updateTask(t.id, {
          milestone_id: milestoneId,
          position: i,
        }),
      ),
    );
  }, []);

  function handleTaskUpdate(updated: Task) {
    setTasksByMilestone((prev) => {
      const next = { ...prev };
      for (const milestoneId of Object.keys(next)) {
        const idx = next[milestoneId].findIndex((t) => t.id === updated.id);
        if (idx !== -1) {
          const newMilestoneId = updated.milestone_id ?? milestoneId;
          if (newMilestoneId !== milestoneId) {
            next[milestoneId] = next[milestoneId].filter((t) => t.id !== updated.id);
            next[newMilestoneId] = sortByPosition([...(next[newMilestoneId] || []), updated]);
          } else {
            next[milestoneId] = sortByPosition(
              next[milestoneId].map((t) => (t.id === updated.id ? updated : t)),
            );
          }
          break;
        }
      }
      return next;
    });
    if (selectedTask?.id === updated.id) setSelectedTask(updated);
  }

  function handleTaskDelete(taskId: string) {
    deleteTask(taskId);
    setTasksByMilestone((prev) => {
      const next = { ...prev };
      for (const milestoneId of Object.keys(next)) {
        next[milestoneId] = next[milestoneId].filter((t) => t.id !== taskId);
      }
      return next;
    });
    if (selectedTask?.id === taskId) {
      setDetailOpen(false);
      setSelectedTask(null);
    }
  }

  function handleTaskAdd(milestoneId: string, task: Task) {
    setTasksByMilestone((prev) => ({
      ...prev,
      [milestoneId]: sortByPosition([...(prev[milestoneId] || []), task]),
    }));
  }

  async function handleTaskPhaseChange(taskId: string, fromMilestoneId: string, toMilestoneId: string) {
    const current = tasksRef.current;
    const targetApproved = (current[toMilestoneId] || []).filter((t) => t.approved);
    const newPosition = targetApproved.length;

    const updated = await updateTask(taskId, {
      milestone_id: toMilestoneId,
      position: newPosition,
    });

    setTasksByMilestone((prev) => {
      const fromPending = (prev[fromMilestoneId] || []).filter((t) => !t.approved);
      const fromApproved = (prev[fromMilestoneId] || []).filter((t) => t.approved && t.id !== taskId);
      const toPending = (prev[toMilestoneId] || []).filter((t) => !t.approved);
      const toApproved = [...targetApproved, updated];

      const next = {
        ...prev,
        [fromMilestoneId]: [...fromPending, ...fromApproved],
        [toMilestoneId]: [...toPending, ...toApproved],
      };
      tasksRef.current = next;
      return next;
    });

    const fromApproved = (tasksRef.current[fromMilestoneId] || []).filter((t) => t.approved);
    const toApproved = (tasksRef.current[toMilestoneId] || []).filter((t) => t.approved);
    await Promise.all([
      persistContainer(fromMilestoneId, fromApproved),
      persistContainer(toMilestoneId, toApproved),
    ]);

    if (selectedTask?.id === taskId) setSelectedTask(updated);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeContainer = findContainer(String(active.id), tasksByMilestone, milestoneIds);
    const overContainer = findContainer(String(over.id), tasksByMilestone, milestoneIds);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setTasksByMilestone((prev) => {
      const activeItems = prev[activeContainer].filter((t) => t.approved);
      const overItems = prev[overContainer].filter((t) => t.approved);
      const activeIndex = activeItems.findIndex((t) => t.id === active.id);
      if (activeIndex === -1) return prev;

      const overIndex = milestoneIds.includes(String(over.id))
        ? overItems.length
        : overItems.findIndex((t) => t.id === over.id);

      const task = activeItems[activeIndex];
      const pendingInActive = prev[activeContainer].filter((t) => !t.approved);
      const pendingInOver = prev[overContainer].filter((t) => !t.approved);

      const newActiveApproved = activeItems.filter((t) => t.id !== active.id);
      const newOverApproved = [
        ...overItems.slice(0, overIndex >= 0 ? overIndex : overItems.length),
        { ...task, milestone_id: overContainer },
        ...overItems.slice(overIndex >= 0 ? overIndex : overItems.length),
      ];

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
      const approved = sortByPosition(current[activeContainer].filter((t) => t.approved));
      const oldIndex = approved.findIndex((t) => t.id === active.id);
      const newIndex = approved.findIndex((t) => t.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const pending = current[activeContainer].filter((t) => !t.approved);
        const reordered = arrayMove(approved, oldIndex, newIndex);
        nextState = {
          ...current,
          [activeContainer]: [...pending, ...reordered],
        };
        setTasksByMilestone(nextState);
      }
    }

    const activeApproved = sortByPosition(
      (nextState[activeContainer] || []).filter((t) => t.approved),
    );
    const overApproved = sortByPosition(
      (nextState[overContainer] || []).filter((t) => t.approved),
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

  function handleMilestoneColorChange(milestoneId: string, color: string) {
    updateMilestone(milestoneId, { color }).then((m) => {
      setProject((prev) => prev ? {
        ...prev,
        milestones: prev.milestones.map((ms) => ms.id === milestoneId ? { ...ms, ...m } : ms),
      } : prev);
    });
  }

  function copyShareLink() {
    if (!project) return;
    navigator.clipboard.writeText(`${window.location.origin}/project/${project.share_token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDeleteProject() {
    if (!project) return;
    setDeleting(true);
    try {
      await deleteProject(project.id);
      router.push("/projects");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
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
  const pendingRequests = allTasks.filter((t) => !t.approved).length;
  const hasApprovedTasks = allTasks.some((t) => t.approved);

  return (
    <div className="w-full p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/projects" className="text-neutral-600 hover:text-neutral-300 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-neutral-100">{project.name}</h1>
          <p className="text-sm text-neutral-600 mt-0.5">
            {(project.company as { name?: string })?.name || "—"}
            {project.client_name && ` · ${project.client_name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyShareLink}
            className="flex items-center gap-2 text-xs border border-neutral-700 px-3 py-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Share client link"}
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center justify-center text-xs border border-neutral-700 p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:border-red-900/50 transition-colors"
            aria-label="Delete project"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-neutral-100">Delete project</DialogTitle>
            <DialogDescription className="text-neutral-500">
              Are you sure you want to delete <span className="text-neutral-300">{project.name}</span>?
              This will permanently remove all phases, tasks, and the client share link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-transparent border-neutral-800">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
              className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteProject}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Deleting..." : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          {project.milestones.map((milestone) => (
            <MilestoneSection
              key={milestone.id}
              milestone={milestone}
              milestones={project.milestones}
              projectId={project.id}
              tasks={tasksByMilestone[milestone.id] || []}
              onDelete={(mid) => {
                deleteMilestone(mid);
                setProject((prev) => prev ? {
                  ...prev,
                  milestones: prev.milestones.filter((ms) => ms.id !== mid),
                } : prev);
                setTasksByMilestone((prev) => {
                  const next = { ...prev };
                  delete next[mid];
                  return next;
                });
              }}
              onCycleStatus={() => {
                const statuses: Milestone["status"][] = ["pending", "in_progress", "completed"];
                const next = statuses[(statuses.indexOf(milestone.status) + 1) % statuses.length];
                updateMilestone(milestone.id, { status: next }).then((m) => {
                  setProject((prev) => prev ? {
                    ...prev,
                    milestones: prev.milestones.map((ms) => ms.id === milestone.id ? { ...ms, ...m } : ms),
                  } : prev);
                });
              }}
              onTaskUpdate={handleTaskUpdate}
              onTaskDelete={handleTaskDelete}
              onTaskAdd={(t) => handleTaskAdd(milestone.id, t)}
              onTaskClick={(t) => { setSelectedTask(t); setDetailOpen(true); }}
              onPhaseChange={handleTaskPhaseChange}
              onColorChange={handleMilestoneColorChange}
            />
          ))}
        </div>
      </DndContext>

      <TaskDetailDialog
        task={selectedTask}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSave={handleTaskUpdate}
      />

      <form onSubmit={handleAddMilestone} className="flex items-center gap-3">
        <PhaseColorPicker
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
    </div>
  );
}

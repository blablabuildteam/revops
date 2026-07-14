"use client";

import { createContext, useContext, useEffect, useState, useRef } from "react";
import {
  Plus, Check, X, Trash2, Pencil, Filter,
} from "lucide-react";
import { PriorityFlag } from "@/components/priority-flag";
import { BinaryText } from "@/components/binary-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EditStatusesDialog } from "@/components/edit-statuses-dialog";
import { TaskFilterBar, useTaskFilters, applyTaskFilters } from "@/components/task-filter-bar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { TaskRowIndicators } from "@/components/task-row-indicators";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { AssigneeLabel, AssigneeSelectItems, useAssigneeUsers } from "@/components/assignee-select";
import { getProject, createTask, updateTask, batchUpdateMilestones, getTaskComments, createTaskComment, getTaskAttachments, uploadTaskAttachment, deleteTaskAttachment } from "@/lib/api";
import {
  createEditBoardTask,
  getEditBoardProject,
  updateEditBoardTask,
  batchUpdateEditBoardMilestones,
  getEditBoardTaskComments,
  createEditBoardTaskComment,
  getEditBoardTaskAttachments,
  uploadEditBoardTaskAttachment,
  deleteEditBoardTaskAttachment,
} from "@/lib/edit-board-api";
import {
  Milestone, Task, resolvePhaseColor,
} from "@/lib/types";
import { formatDate, toDateInputValue } from "@/lib/format";

export const TASK_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_36px_32px_140px_150px_150px_32px] items-center gap-x-3 gap-y-2";

const UNASSIGNED_ID = "unassigned";

type BoardApi = {
  getProject: (projectId: string) => Promise<{ milestones?: Milestone[] }>;
  createTask: (projectId: string, data: Partial<Task>) => Promise<Task>;
  updateTask: (id: string, data: Partial<Task>) => Promise<Task>;
  batchUpdateMilestones: (
    projectId: string,
    milestones: { id?: string; name: string; color?: string | null; position: number }[],
  ) => Promise<Milestone[]>;
  getTaskComments: (taskId: string) => Promise<import("@/lib/types").TaskComment[]>;
  createTaskComment: (taskId: string, body: string) => Promise<import("@/lib/types").TaskComment>;
  getTaskAttachments: (taskId: string) => Promise<import("@/lib/types").TaskAttachment[]>;
  uploadTaskAttachment: (taskId: string, file: File) => Promise<import("@/lib/types").TaskAttachment>;
  deleteTaskAttachment: (taskId: string, attachmentId: string) => Promise<void>;
};

const defaultBoardApi: BoardApi = {
  getProject,
  createTask,
  updateTask,
  batchUpdateMilestones,
  getTaskComments,
  createTaskComment,
  getTaskAttachments,
  uploadTaskAttachment,
  deleteTaskAttachment,
};

const BoardApiContext = createContext<BoardApi>(defaultBoardApi);

export function useBoardApi() {
  return useContext(BoardApiContext);
}

export { BoardApiContext };
export type { BoardApi };

export function buildEditBoardApi(editToken: string): BoardApi {
  return {
    getProject: () => getEditBoardProject(editToken),
    createTask: (_projectId, data) => createEditBoardTask(editToken, data),
    updateTask: (id, data) => updateEditBoardTask(editToken, id, data),
    batchUpdateMilestones: (_projectId, milestones) =>
      batchUpdateEditBoardMilestones(editToken, milestones),
    getTaskComments: (taskId) => getEditBoardTaskComments(editToken, taskId),
    createTaskComment: (taskId, body) => createEditBoardTaskComment(editToken, taskId, body),
    getTaskAttachments: (taskId) => getEditBoardTaskAttachments(editToken, taskId),
    uploadTaskAttachment: (taskId, file) => uploadEditBoardTaskAttachment(editToken, taskId, file),
    deleteTaskAttachment: (taskId, attachmentId) =>
      deleteEditBoardTaskAttachment(editToken, taskId, attachmentId),
  };
}

function isApprovedTask(task: Task) {
  return task.approved !== false;
}

function isTopLevelTask(task: Task) {
  return isApprovedTask(task) && !task.parent_id;
}

function sortByPosition(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
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

function cancelDrag(e: React.PointerEvent) {
  e.stopPropagation();
}

function TaskColumnHeader() {
  return (
    <div className={`${TASK_ROW_GRID} px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-600 border-b border-neutral-800/60`}>
      <span>Task</span>
      <span />
      <span />
      <span>Responsible</span>
      <span>Date</span>
      <span>Phase</span>
      <span />
    </div>
  );
}

function InlineAssigneeSelect({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (t: Task) => void;
}) {
  const boardApi = useBoardApi();
  const assigneeUsers = useAssigneeUsers();
  return (
    <Select
      value={task.assignee || "none"}
      onValueChange={(v) => {
        boardApi.updateTask(task.id, { assignee: !v || v === "none" ? undefined : v }).then(onUpdate);
      }}
    >
      <SelectTrigger
        size="sm"
        className="h-7 w-full text-xs bg-neutral-800/50 border-neutral-700/50 text-neutral-400 px-2"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={cancelDrag}
      >
        <SelectValue placeholder="—">
          <AssigneeLabel name={task.assignee} users={assigneeUsers} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-neutral-800 border-neutral-700">
        <AssigneeSelectItems users={assigneeUsers} />
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
  const boardApi = useBoardApi();
  return (
    <DatePicker
      value={toDateInputValue(task.due_date)}
      onChange={(v) => {
        boardApi.updateTask(task.id, { due_date: v || null }).then(onUpdate);
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={cancelDrag}
      size="sm"
      className="h-7 w-full bg-neutral-800/50 border-neutral-700/50 text-neutral-400"
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
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: currentColor }} />
              <span className="truncate" style={{ color: currentColor }}>{current.name}</span>
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
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
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
    if (trimmed !== task.title) await onRename(trimmed);
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
          if (e.key === "Enter") { e.preventDefault(); void commit(); }
          if (e.key === "Escape") { setValue(task.title); setEditing(false); }
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={cancelDrag}
        className={`h-7 text-xs bg-neutral-800 border-neutral-600 text-neutral-100 flex-1 min-w-0 ${indent ? "ml-5" : ""}`}
      />
    );
  }

  return (
    <div className={`min-w-0 flex-1 flex items-center gap-0.5 ${indent ? "pl-5 border-l border-neutral-800/80 ml-1" : ""}`}>
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left cursor-pointer">
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
        <button type="button" title="Rename" onClick={startEdit} onPointerDown={cancelDrag}
          className="p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800">
          <Pencil className="w-4 h-4" />
        </button>
        {allowSubtasks && onAddSubtask && (
          <button type="button" title="Add subtask" onClick={(e) => { e.stopPropagation(); onAddSubtask(); }}
            onPointerDown={cancelDrag}
            className="p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800">
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  currentMilestoneId,
  milestones,
  onUpdate,
  onDelete,
  onClick,
  onPhaseChange,
  onRename,
  onAddSubtask,
  indent = false,
}: {
  task: Task;
  currentMilestoneId: string;
  milestones: Milestone[];
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
  onClick: (t: Task) => void;
  onPhaseChange: (taskId: string, fromMilestoneId: string, toMilestoneId: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onAddSubtask?: () => void;
  indent?: boolean;
}) {
  const boardApi = useBoardApi();
  return (
    <div className={`${TASK_ROW_GRID} px-3 py-1.5 rounded-lg hover:bg-neutral-900/50 transition-colors group`}>
      <TaskNameCell
        task={task}
        indent={indent}
        allowSubtasks={!indent}
        onOpen={() => onClick(task)}
        onRename={(title) => onRename(task.id, title)}
        onAddSubtask={onAddSubtask}
      />
      <TaskRowIndicators task={task} />
      <PriorityFlag
        priority={task.priority ?? "low"}
        onChange={(next) => { boardApi.updateTask(task.id, { priority: next }).then(onUpdate); }}
      />
      <InlineAssigneeSelect task={task} onUpdate={onUpdate} />
      <InlineDateInput task={task} onUpdate={onUpdate} />
      {indent ? (
        <span className="text-xs text-neutral-700">—</span>
      ) : (
        <InlinePhaseSelect
          task={task}
          currentMilestoneId={currentMilestoneId}
          milestones={milestones}
          onPhaseChange={onPhaseChange}
        />
      )}
      <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
        onPointerDown={cancelDrag}
        className="opacity-0 group-hover:opacity-100 text-neutral-700 hover:text-red-400 transition-all p-1.5 rounded justify-self-end cursor-pointer">
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
}) {
  const boardApi = useBoardApi();
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");

  async function submitSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!subtaskTitle.trim()) return;
    const newTask = await boardApi.createTask(projectId, {
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
      <TaskRow
        task={task}
        currentMilestoneId={currentMilestoneId}
        milestones={milestones}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onClick={onClick}
        onPhaseChange={onPhaseChange}
        onRename={onRename}
        onAddSubtask={() => setAddingSubtask(true)}
      />
      {subtasks.map((subtask) => (
        <TaskRow
          key={subtask.id}
          task={subtask}
          indent
          currentMilestoneId={currentMilestoneId}
          milestones={milestones}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onClick={onClick}
          onPhaseChange={onPhaseChange}
          onRename={onRename}
        />
      ))}
      {addingSubtask && (
        <form onSubmit={submitSubtask} className={`${TASK_ROW_GRID} px-3 py-1.5 items-center`}>
          <Input
            autoFocus
            value={subtaskTitle}
            onChange={(e) => setSubtaskTitle(e.target.value)}
            placeholder="Subtask name..."
            onPointerDown={cancelDrag}
            className="h-7 text-xs bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 ml-5 flex-1 min-w-0"
          />
          <span /><span /><span /><span />
          <div className="flex items-center gap-1 justify-self-end">
            <Button type="submit" size="sm" className="h-7 text-xs bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 px-2">
              <Check className="w-3 h-3" />
            </Button>
            <Button type="button" size="sm" variant="ghost"
              className="h-7 text-xs text-neutral-600 hover:text-neutral-400 px-2"
              onClick={() => { setAddingSubtask(false); setSubtaskTitle(""); }}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </form>
      )}
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
  const boardApi = useBoardApi();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const task = await boardApi.createTask(projectId, { title: title.trim(), milestone_id: milestoneId });
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
      <Button type="submit" size="sm" className="h-7 text-xs bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 px-2">
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

function MilestoneTasksSection({
  milestone,
  milestones,
  projectId,
  tasks,
  onTaskUpdate,
  onTaskDelete,
  onTaskAdd,
  onTaskClick,
  onPhaseChange,
  onRename,
  isUnassigned,
  showEmptyPhases,
}: {
  milestone: Milestone;
  milestones: Milestone[];
  projectId: string;
  tasks: Task[];
  onTaskUpdate: (t: Task) => void;
  onTaskDelete: (id: string) => void;
  onTaskAdd: (t: Task) => void;
  onTaskClick: (t: Task) => void;
  onPhaseChange: (taskId: string, fromMilestoneId: string, toMilestoneId: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  isUnassigned?: boolean;
  showEmptyPhases?: boolean;
}) {
  const approvedTopLevel = sortByPosition(tasks.filter(isTopLevelTask));
  const subtasksByParent = groupSubtasksByParent(tasks);
  const titleColor = isUnassigned
    ? "#a3a3a3"
    : resolvePhaseColor(milestone.name, milestone.color);

  if (approvedTopLevel.length === 0 && !showEmptyPhases) return null;

  return (
    <div className={`border rounded-lg overflow-hidden ${
      isUnassigned ? "border-amber-900/50 bg-amber-950/10" : "border-neutral-800"
    }`}>
      <div className="flex items-center gap-3 px-4 py-2.5 bg-neutral-900/60 border-b border-neutral-800">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: titleColor }} />
        <h3 className="text-sm font-medium truncate flex-1" style={{ color: titleColor }}>
          {milestone.name}
        </h3>
        <span className="text-xs text-neutral-600 font-mono">
          {approvedTopLevel.length} task{approvedTopLevel.length !== 1 ? "s" : ""}
        </span>
      </div>
      <TaskColumnHeader />
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
          />
        ))}
      </div>
      <AddTaskInline onAdd={onTaskAdd} projectId={projectId} milestoneId={isUnassigned ? undefined : milestone.id} />
    </div>
  );
}

function isDonePhase(name: string) {
  return name.toLowerCase() === "done";
}

type ProjectDetail = {
  milestones: Milestone[];
};

export function ProjectTaskBoardPanel({
  projectId,
  tasks,
  filterStatus,
  onTaskUpdate,
  onTaskDelete,
  showAllPhases,
  milestonesOverride,
  hideToolbar,
}: {
  projectId: string;
  tasks: Task[];
  filterStatus: "active" | "all" | "done";
  onTaskUpdate: (t: Task, milestone?: { name?: string; color?: string }) => void;
  onTaskDelete: (id: string) => void;
  showAllPhases?: boolean;
  milestonesOverride?: Milestone[];
  hideToolbar?: boolean;
}) {
  const boardApi = useBoardApi();
  const [milestones, setMilestones] = useState<Milestone[]>(milestonesOverride ?? []);
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [loading, setLoading] = useState(!milestonesOverride);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editStatusesOpen, setEditStatusesOpen] = useState(false);
  const { filters, addFilter, updateFilter, removeFilter, clearFilters } = useTaskFilters();

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    if (milestonesOverride) {
      setMilestones(milestonesOverride);
      setLoading(false);
      return;
    }
    setLoading(true);
    boardApi.getProject(projectId)
      .then((p) => {
        setMilestones((p as ProjectDetail).milestones ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId, milestonesOverride]);

  function milestoneMeta(milestoneId?: string | null) {
    if (!milestoneId) return { name: undefined, color: undefined };
    const m = milestones.find((ms) => ms.id === milestoneId);
    return m ? { name: m.name, color: m.color ?? undefined } : {};
  }

  function handleTaskUpdate(updated: Task) {
    setLocalTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    onTaskUpdate(updated, milestoneMeta(updated.milestone_id));
    if (selectedTask?.id === updated.id) setSelectedTask(updated);
  }

  function handleTaskAdd(task: Task) {
    setLocalTasks((prev) => [...prev, task]);
    onTaskUpdate(task, milestoneMeta(task.milestone_id));
  }

  async function handlePhaseChange(taskId: string, fromMilestoneId: string, toMilestoneId: string) {
    const targetTopLevel = localTasks.filter(
      (t) => (t.milestone_id ?? UNASSIGNED_ID) === toMilestoneId && isTopLevelTask(t),
    );
    const updated = await boardApi.updateTask(taskId, {
      milestone_id: toMilestoneId === UNASSIGNED_ID ? null : toMilestoneId,
      position: targetTopLevel.length,
    });
    handleTaskUpdate(updated);
  }

  async function handleRename(id: string, title: string) {
    const updated = await boardApi.updateTask(id, { title });
    handleTaskUpdate(updated);
  }

  const tasksByMilestone = new Map<string, Task[]>();
  for (const m of milestones) {
    tasksByMilestone.set(m.id, []);
  }
  const unassigned: Task[] = [];
  for (const task of localTasks) {
    const bucket = task.milestone_id ? tasksByMilestone.get(task.milestone_id) : undefined;
    if (bucket) bucket.push(task);
    else unassigned.push(task);
  }

  const unassignedMilestone: Milestone = {
    id: UNASSIGNED_ID,
    project_id: projectId,
    name: "Unassigned",
    position: -1,
    status: "pending",
    tasks: [],
    created_at: "",
    updated_at: "",
  };

  const visibleMilestones = showAllPhases
    ? milestones
    : milestones.filter((m) => {
        const sectionTasks = tasksByMilestone.get(m.id) ?? [];
        const hasTasks = sectionTasks.some(isTopLevelTask);
        if (!hasTasks) return false;
        if (filterStatus === "active") return !isDonePhase(m.name);
        if (filterStatus === "done") return isDonePhase(m.name);
        return true;
      });

  const showUnassigned = unassigned.some(isTopLevelTask) && (showAllPhases || filterStatus !== "done");

  if (loading) {
    return (
      <div className="px-4 py-6 space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-20 bg-neutral-900/50 rounded-lg animate-pulse border border-neutral-800" />
        ))}
      </div>
    );
  }

  const hasVisibleTasks = visibleMilestones.length > 0 || showUnassigned;

  return (
    <>
      <div className="px-3 py-3 space-y-3">
        {!hideToolbar && (
        <div className="flex items-center justify-end gap-2 px-1">
          <Popover>
            <PopoverTrigger
              className={`flex items-center gap-1.5 text-xs py-1 px-2 rounded transition-colors cursor-pointer ${
                filters.length > 0
                  ? "text-[#e8ff47]"
                  : "text-neutral-600 hover:text-neutral-300"
              }`}
            >
              <Filter className="w-3 h-3" />
              Filter{filters.filter((f) => f.value).length > 0 && ` (${filters.filter((f) => f.value).length})`}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto min-w-[320px] p-3">
              <TaskFilterBar
                filters={filters}
                milestones={milestones}
                onAddFilter={addFilter}
                onUpdateFilter={updateFilter}
                onRemoveFilter={removeFilter}
                onClearFilters={clearFilters}
              />
            </PopoverContent>
          </Popover>
          <button
            onClick={() => setEditStatusesOpen(true)}
            className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-300 transition-colors shrink-0"
          >
            <Pencil className="w-3 h-3" />
            Edit statuses
          </button>
        </div>
        )}
        {!hasVisibleTasks && (
          <p className="text-xs text-neutral-700 px-1 py-2">No tasks in this view</p>
        )}
        {visibleMilestones.map((milestone) => (
          <MilestoneTasksSection
            key={milestone.id}
            milestone={milestone}
            milestones={milestones}
            projectId={projectId}
            tasks={applyTaskFilters(tasksByMilestone.get(milestone.id) ?? [], filters, milestones)}
            onTaskUpdate={handleTaskUpdate}
            onTaskDelete={onTaskDelete}
            onTaskAdd={handleTaskAdd}
            onTaskClick={(t) => { setSelectedTask(t); setDetailOpen(true); }}
            onPhaseChange={handlePhaseChange}
            onRename={handleRename}
            showEmptyPhases={showAllPhases}
          />
        ))}
        {showUnassigned && (
          <MilestoneTasksSection
            milestone={unassignedMilestone}
            milestones={milestones}
            projectId={projectId}
            tasks={applyTaskFilters(unassigned, filters, milestones)}
            onTaskUpdate={handleTaskUpdate}
            onTaskDelete={onTaskDelete}
            onTaskAdd={handleTaskAdd}
            onTaskClick={(t) => { setSelectedTask(t); setDetailOpen(true); }}
            onPhaseChange={handlePhaseChange}
            onRename={handleRename}
            isUnassigned
            showEmptyPhases={showAllPhases}
          />
        )}
      </div>
      <TaskDetailDialog
        task={selectedTask}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSave={handleTaskUpdate}
        api={boardApi}
      />
      <EditStatusesDialog
        open={editStatusesOpen}
        onOpenChange={setEditStatusesOpen}
        projectId={projectId}
        milestones={milestones}
        onSave={(updated) => setMilestones(updated)}
      />
    </>
  );
}

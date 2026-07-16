"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import {
  Plus, CheckCircle2, Circle, Clock, Trash2,
  User, Building2, FolderKanban, Calendar,
  ChevronDown, ChevronRight, ListTodo, ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { BinaryText } from "@/components/binary-text";
import { PriorityFlag, type Priority } from "@/components/priority-flag";
import { CompanyAvatar } from "@/components/company-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { getCompanies, getProjects, getUsers } from "@/lib/api";
import { Company, Project } from "@/lib/types";
import { formatDate, toDateInputValue } from "@/lib/format";
import { useConfirmDelete } from "@/components/confirm-delete-dialog";
import { ProjectTaskBoardPanel } from "@/components/project-task-board";
import { Task } from "@/lib/types";
import { useSession } from "@/components/session-provider";
import { cacheKeys, getCached } from "@/lib/query-cache";
import { useMutationFeedback, useUndoToast } from "@/components/mutation-provider";
import { useUndoablePatch } from "@/hooks/use-undoable-patch";

interface TodoUser { id: string; email: string; name: string }
interface Todo {
  id: string;
  title: string;
  description?: string;
  status: "open" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  assignee_id?: string;
  assignee_name?: string;
  company_id?: string;
  company_name?: string;
  project_id?: string;
  project_name?: string;
  project_company_name?: string;
  project_company_logo_url?: string;
  due_date?: string;
  created_at: string;
  updated_at?: string;
  _source: "todo";
}

async function putTodo(id: string, patch: Record<string, unknown>): Promise<Todo> {
  const res = await fetch(`/api/todos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  return { ...data, _source: "todo" };
}

interface ProjectBoardTask {
  id: string;
  title: string;
  description?: string;
  status: "open" | "in_progress" | "done";
  priority: Priority;
  assignee?: string;
  due_date?: string;
  project_id: string;
  project_name: string;
  company_name?: string;
  company_id?: string;
  company_logo_url?: string;
  milestone_id?: string | null;
  milestone_name?: string;
  milestone_color?: string;
  parent_id?: string | null;
  position?: number;
  approved?: boolean;
  url?: string | null;
  created_at: string;
  updated_at?: string;
  _source: "task";
}

function boardTaskToTask(t: ProjectBoardTask): Task {
  return {
    id: t.id,
    project_id: t.project_id,
    milestone_id: t.milestone_id ?? null,
    parent_id: t.parent_id ?? null,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    created_by: "team",
    approved: t.approved !== false,
    assignee: t.assignee ?? null,
    due_date: t.due_date ?? null,
    url: t.url ?? null,
    priority: t.priority ?? "low",
    position: t.position ?? 0,
    created_at: t.created_at,
    updated_at: t.updated_at ?? t.created_at,
  };
}

function isDonePhase(name?: string) {
  return (name ?? "").toLowerCase() === "done";
}

type TodoStatus = Todo["status"];

const statusIcon: Record<TodoStatus, ReactNode> = {
  open: <Circle className="w-4 h-4 text-neutral-500" />,
  in_progress: <Clock className="w-4 h-4 text-blue-400" />,
  done: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
};

const statusLabel: Record<TodoStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

const statusTextClass: Record<TodoStatus, string> = {
  open: "text-neutral-400",
  in_progress: "text-blue-400",
  done: "text-emerald-400",
};

function nextTodoStatus(status: TodoStatus): TodoStatus | null {
  if (status === "open") return "in_progress";
  if (status === "in_progress") return "done";
  return null;
}

function statusActionLabel(status: TodoStatus, allowReopen = false): string {
  if (status === "done" && allowReopen) return "Reopen to-do";
  if (status === "open") return "Mark in progress";
  if (status === "in_progress") return "Mark done";
  return "Done";
}

function sortCompletedLatest(todos: Todo[]) {
  return [...todos].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime();
    const bTime = new Date(b.updated_at || b.created_at).getTime();
    return bTime - aTime;
  });
}

function assigneeOptions(users: TodoUser[], currentUser: TodoUser | null): TodoUser[] {
  if (!currentUser) return users;
  if (users.some((u) => u.id === currentUser.id)) return users;
  return [currentUser, ...users];
}

function assigneeLabel(users: TodoUser[], assigneeId: string, currentUser: TodoUser | null) {
  if (!assigneeId) return "Nobody";
  return (
    users.find((u) => u.id === assigneeId)?.name ??
    (currentUser?.id === assigneeId ? currentUser.name : null) ??
    "Choose person"
  );
}

function namedOptionLabel(
  items: { id: string; name: string }[],
  id: string,
  emptyLabel: string
) {
  if (!id) return emptyLabel;
  return items.find((i) => i.id === id)?.name ?? emptyLabel;
}

const statusFilterLabels: Record<string, string> = {
  active: "Active",
  all: "All",
  done: "Done",
};

// ---------------------------------------------------------------------------
// New Task Dialog (full form)
// ---------------------------------------------------------------------------

function TodoFormDialog({
  open, onClose, onSave, todo, users, companies, projects, currentUser, defaultProjectId,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (t: Todo) => void;
  todo?: Todo | null;
  users: TodoUser[];
  companies: Company[];
  projects: Project[];
  currentUser: TodoUser | null;
  defaultProjectId?: string;
}) {
  const isEdit = !!todo;
  const [form, setForm] = useState({
    title: "", description: "", priority: "low",
    assignee_id: "",
    company_id: "", project_id: defaultProjectId ?? "", due_date: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const withUndo = useUndoToast();

  const people = assigneeOptions(users, currentUser);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (todo) {
      setForm({
        title: todo.title,
        description: todo.description ?? "",
        priority: todo.priority,
        assignee_id: todo.assignee_id ?? "",
        company_id: todo.company_id ?? "",
        project_id: todo.project_id ?? "",
        due_date: toDateInputValue(todo.due_date),
      });
      return;
    }
    setForm({
      title: "", description: "", priority: "low",
      assignee_id: currentUser?.id ?? "",
      company_id: "", project_id: defaultProjectId ?? "", due_date: "",
    });
  }, [open, todo, currentUser, defaultProjectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...form,
        assignee_id:
          form.assignee_id === ""
            ? null
            : (form.assignee_id || currentUser?.id || null),
        company_id: form.company_id || null,
        project_id: form.project_id || null,
        due_date: form.due_date || null,
      };
      const res = await fetch(isEdit ? `/api/todos/${todo!.id}` : "/api/todos", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? (isEdit ? "Failed to update task" : "Failed to create task"));
        return;
      }
      if (isEdit && todo) {
        await withUndo({
          label: "Updated",
          run: async () => {
            onSave({ ...data, _source: "todo" });
            onClose();
          },
          undo: async () => {
            const reverted = await putTodo(todo.id, {
              title: todo.title,
              description: todo.description ?? null,
              priority: todo.priority,
              assignee_id: todo.assignee_id ?? null,
              company_id: todo.company_id ?? null,
              project_id: todo.project_id ?? null,
              due_date: todo.due_date ?? null,
            });
            onSave(reverted);
          },
        });
        return;
      }
      onSave({ ...data, _source: "todo" });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const s = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Task *</Label>
            <Input required value={form.title} onChange={(e) => s("title", e.target.value)}
              placeholder="What needs to be done?"
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Description</Label>
            <Textarea value={form.description} onChange={(e) => s("description", e.target.value)}
              placeholder="Optional details..."
              rows={2} className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => s("priority", v ?? "low")}>
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="high" className="text-red-400">High</SelectItem>
                  <SelectItem value="medium" className="text-amber-400">Medium</SelectItem>
                  <SelectItem value="low" className="text-neutral-400">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Assigned to</Label>
              <Select value={form.assignee_id || "none"} onValueChange={(v) => s("assignee_id", v === "none" ? "" : (v ?? ""))}>
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue placeholder="Choose person">
                    {assigneeLabel(people, form.assignee_id, currentUser)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="none" className="text-neutral-400">Nobody</SelectItem>
                  {people.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-neutral-100">{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Client</Label>
              <Select value={form.company_id || "none"} onValueChange={(v) => s("company_id", v === "none" ? "" : (v ?? ""))}>
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue placeholder="Optional">
                    {namedOptionLabel(companies, form.company_id, "No client")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="none" className="text-neutral-400">No client</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-neutral-100">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Project</Label>
              <Select value={form.project_id || "none"} onValueChange={(v) => s("project_id", v === "none" ? "" : (v ?? ""))}>
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue placeholder="Optional">
                    {namedOptionLabel(projects, form.project_id, "No project")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="none" className="text-neutral-400">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-neutral-100">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Due date</Label>
            <DatePicker
              value={form.due_date}
              onChange={(v) => s("due_date", v)}
              className="bg-neutral-800 border-neutral-700 text-neutral-100"
            />
          </div>
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800">Cancel</Button>
            <Button type="submit" disabled={loading}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium">
              {loading ? (isEdit ? "Saving..." : "Adding...") : (isEdit ? "Save" : "Add")}
            </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inline Quick-Add for personal to-dos
// ---------------------------------------------------------------------------

function QuickAddTodo({ onAdd, currentUser }: {
  onAdd: (t: Todo) => void;
  currentUser: TodoUser | null;
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: value.trim(),
          priority: "low",
          assignee_id: currentUser?.id ?? null,
          company_id: null,
          project_id: null,
          due_date: null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        onAdd(data);
        setValue("");
        inputRef.current?.focus();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <div className="flex items-center gap-2 flex-1 bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-1.5 focus-within:border-neutral-600 transition-colors">
        <Plus className="w-4 h-4 text-neutral-600 shrink-0" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a quick to-do..."
          className="flex-1 bg-transparent text-sm text-neutral-200 placeholder:text-neutral-600 outline-none"
        />
      </div>
      {value.trim() && (
        <Button
          type="submit"
          disabled={loading}
          size="sm"
          className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium h-8 px-3 text-xs shrink-0"
        >
          {loading ? "..." : "Add"}
        </Button>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Clickable status control + shared status update
// ---------------------------------------------------------------------------

function useTodoStatusChange(todo: Todo, onUpdate: (t: Todo) => void) {
  const { begin, end, pushUndo } = useMutationFeedback();

  const changeStatus = useCallback((next: TodoStatus) => {
    if (next === todo.status) return;
    const prev = todo.status;
    onUpdate({ ...todo, status: next, _source: "todo" });

    begin();
    fetch(`/api/todos/${todo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
      .then((r) => r.json())
      .then((d) => {
        onUpdate({ ...d, _source: "todo" });
        pushUndo({
          label: "Status changed",
          revert: async () => {
            onUpdate({ ...todo, status: prev, _source: "todo" });
            const res = await fetch(`/api/todos/${todo.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: prev }),
            });
            const data = await res.json();
            onUpdate({ ...data, _source: "todo" });
          },
        });
      })
      .catch(() => onUpdate({ ...todo, status: prev, _source: "todo" }))
      .finally(() => end());
  }, [todo, onUpdate, begin, end, pushUndo]);

  const cycleStatus = useCallback(() => {
    const next = nextTodoStatus(todo.status);
    if (next) changeStatus(next);
  }, [todo.status, changeStatus]);

  return { changeStatus, cycleStatus };
}

function TodoStatusButton({
  status,
  onClick,
  allowReopen = false,
  className,
}: {
  status: TodoStatus;
  onClick: () => void;
  allowReopen?: boolean;
  className?: string;
}) {
  const canInteract = status !== "done" || allowReopen;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={!canInteract}
      title={statusActionLabel(status, allowReopen)}
      aria-label={statusActionLabel(status, allowReopen)}
      className={`flex items-center gap-1.5 shrink-0 transition-colors rounded px-1 py-0.5 ${
        canInteract
          ? "hover:bg-neutral-800 cursor-pointer"
          : "cursor-default"
      } ${className ?? ""}`}
    >
      {statusIcon[status]}
      <span className={`text-xs ${statusTextClass[status]}`}>{statusLabel[status]}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Compact todo row for the checklist
// ---------------------------------------------------------------------------

function TodoRow({ todo, onUpdate, onDelete, onEdit, allowReopen = false }: {
  todo: Todo;
  onUpdate: (t: Todo) => void;
  onDelete: (id: string) => void;
  onEdit: (t: Todo) => void;
  allowReopen?: boolean;
}) {
  const { changeStatus, cycleStatus } = useTodoStatusChange(todo, onUpdate);
  const patchTodo = useUndoablePatch<Todo>();

  function handleStatusClick() {
    if (allowReopen && todo.status === "done") {
      changeStatus("open");
      return;
    }
    cycleStatus();
  }

  const isOverdue = todo.due_date && todo.status !== "done" &&
    new Date(todo.due_date) < new Date();

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all group ${
      todo.status === "done"
        ? "opacity-50 bg-neutral-900/20 border-neutral-800/50"
        : "bg-neutral-900/40 border-neutral-800 hover:border-neutral-700"
    }`}>
      <TodoStatusButton
        status={todo.status}
        onClick={handleStatusClick}
        allowReopen={allowReopen}
      />
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onEdit(todo)}
          className={`flex-1 min-w-0 text-left cursor-pointer hover:text-neutral-100 transition-colors ${
            todo.status === "done" ? "line-through text-neutral-600" : "text-neutral-200"
          }`}
        >
          <p className="text-sm leading-snug flex items-center gap-1.5 min-w-0">
            <span className="truncate">
              <BinaryText text={todo.title} id={todo.id} />
            </span>
            {isOverdue && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"
                title="Overdue"
                aria-label="Overdue"
              />
            )}
          </p>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {todo.assignee_name && (
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              <User className="w-3 h-3" /> {todo.assignee_name}
            </span>
          )}
          {todo.due_date && (
            <span className={`flex items-center gap-1 text-xs font-mono ${isOverdue ? "text-red-400" : "text-neutral-500"}`}>
              <Calendar className={`w-3 h-3 ${isOverdue ? "text-red-400" : ""}`} />
              {formatDate(todo.due_date)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center shrink-0">
        <PriorityFlag
          priority={todo.priority}
          onChange={(next) => {
            void patchTodo({
              item: todo,
              patch: { priority: next },
              apply: (id, patch) => putTodo(id, patch),
              onSuccess: onUpdate,
            });
          }}
        />
        <button onClick={() => onDelete(todo.id)}
          className="opacity-0 group-hover:opacity-100 p-1 text-neutral-700 hover:text-red-400 transition-all rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded todo card (used in project groups for more detail)
// ---------------------------------------------------------------------------

function TodoCard({ todo, onUpdate, onDelete, onEdit }: {
  todo: Todo;
  onUpdate: (t: Todo) => void;
  onDelete: (id: string) => void;
  onEdit: (t: Todo) => void;
}) {
  const { cycleStatus } = useTodoStatusChange(todo, onUpdate);
  const patchTodo = useUndoablePatch<Todo>();

  const isOverdue = todo.due_date && todo.status !== "done" &&
    new Date(todo.due_date) < new Date();

  return (
    <div className={`flex items-start gap-3 px-3.5 py-2.5 transition-all group ${
      todo.status === "done" ? "opacity-50" : ""
    }`}>
      <div className="shrink-0 mt-0.5">
        <TodoStatusButton status={todo.status} onClick={cycleStatus} />
      </div>
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => onEdit(todo)}
          className={`w-full text-left cursor-pointer hover:text-neutral-100 transition-colors ${
            todo.status === "done" ? "line-through text-neutral-600" : "text-neutral-200"
          }`}
        >
          <p className="text-sm leading-snug flex items-center gap-1.5 min-w-0">
            <span className="truncate">
              <BinaryText text={todo.title} id={todo.id} />
            </span>
            {isOverdue && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"
                title="Overdue"
                aria-label="Overdue"
              />
            )}
          </p>
        </button>
        {todo.description && (
          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
            <BinaryText text={todo.description} id={`${todo.id}-desc`} />
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {todo.assignee_name && (
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              <User className="w-3 h-3" /> {todo.assignee_name}
            </span>
          )}
          {todo.company_name && (
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              <Building2 className="w-3 h-3" /> {todo.company_name}
            </span>
          )}
          {todo.due_date && (
            <span className={`flex items-center gap-1 text-xs font-mono ${isOverdue ? "text-red-400" : "text-neutral-500"}`}>
              <Calendar className={`w-3 h-3 ${isOverdue ? "text-red-400" : ""}`} />
              {formatDate(todo.due_date)}
              {isOverdue && " · overdue"}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center shrink-0">
        <PriorityFlag
          priority={todo.priority}
          onChange={(next) => {
            void patchTodo({
              item: todo,
              patch: { priority: next },
              apply: (id, patch) => putTodo(id, patch),
              onSuccess: onUpdate,
            });
          }}
        />
        <button onClick={() => onDelete(todo.id)}
          className="opacity-0 group-hover:opacity-100 p-1 text-neutral-700 hover:text-red-400 transition-all rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible project group
// ---------------------------------------------------------------------------

function ProjectGroup({
  projectId, projectName, companyName, companyLogoUrl,
  todos, boardTasks, filterStatus,
  onTodoUpdate, onTodoDelete, onTodoEdit,
  onBoardTaskUpdate, onBoardTaskDelete, onNewTask,
}: {
  projectId: string;
  projectName: string;
  companyName?: string;
  companyLogoUrl?: string;
  todos: Todo[];
  boardTasks: ProjectBoardTask[];
  filterStatus: "active" | "all" | "done";
  onTodoUpdate: (t: Todo) => void;
  onTodoDelete: (id: string) => void;
  onTodoEdit: (t: Todo) => void;
  onBoardTaskUpdate: (t: Task, milestone?: { name?: string; color?: string }) => void;
  onBoardTaskDelete: (id: string) => void;
  onNewTask: (projectId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const visibleTodos = filterStatus === "done"
    ? todos.filter((t) => t.status === "done")
    : filterStatus === "active"
      ? todos.filter((t) => t.status !== "done")
      : todos;

  const todoDone = todos.filter((t) => t.status === "done").length;
  const boardDone = boardTasks.filter((t) => isDonePhase(t.milestone_name)).length;
  const total = todos.length + boardTasks.length;
  const doneCount = todoDone + boardDone;

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-4 py-3 bg-neutral-900/60 hover:bg-neutral-900/80 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
        }
        {companyName ? (
          <CompanyAvatar name={companyName} logoUrl={companyLogoUrl} size="sm" />
        ) : (
          <FolderKanban className="w-4 h-4 text-neutral-500 shrink-0" />
        )}
        <span className="flex-1 min-w-0">
          <span className="text-sm font-medium text-neutral-200 truncate">{projectName}</span>
        </span>
        <span className="text-xs text-neutral-600 font-mono shrink-0">
          {doneCount}/{total}
        </span>
        <div
          className="w-16 h-1.5 rounded-full bg-neutral-800 overflow-hidden shrink-0"
          title={`${doneCount} of ${total} done`}
        >
          {total > 0 && (
            <div
              className="h-full rounded-full bg-emerald-500/70 transition-all"
              style={{ width: `${(doneCount / total) * 100}%` }}
            />
          )}
        </div>
      </button>

      {expanded && (
        <>
          {visibleTodos.length > 0 && (
            <div className="divide-y divide-neutral-800/40 border-b border-neutral-800/60">
              <div className="px-4 py-1.5">
                <span className="text-[10px] text-neutral-600 uppercase tracking-widest">To-dos</span>
              </div>
              {visibleTodos.map((todo) => (
                <TodoCard
                  key={`todo-${todo.id}`}
                  todo={todo}
                  onUpdate={onTodoUpdate}
                  onDelete={onTodoDelete}
                  onEdit={onTodoEdit}
                />
              ))}
            </div>
          )}
          <ProjectTaskBoardPanel
            projectId={projectId}
            tasks={boardTasks.map(boardTaskToTask)}
            filterStatus={filterStatus}
            hideToolbar
            onTaskUpdate={onBoardTaskUpdate}
            onTaskDelete={onBoardTaskDelete}
          />
          {total === 0 && (
            <p className="text-xs text-neutral-700 px-4 py-3">No tasks yet</p>
          )}
          <div className="px-3 py-2 flex items-center gap-2 border-t border-neutral-800/60">
            <button
              onClick={() => onNewTask(projectId)}
              className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add task
            </button>
            <span className="text-neutral-800">·</span>
            <Link
              href={`/projects/${projectId}`}
              className="text-xs text-neutral-600 hover:text-[#e8ff47] transition-colors"
            >
              Open project board
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TodosPage() {
  const { user: sessionUser, ready: sessionReady } = useSession();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [boardTasks, setBoardTasks] = useState<ProjectBoardTask[]>([]);
  const [users, setUsers] = useState<TodoUser[]>(
    () => (getCached<TodoUser[]>(cacheKeys.users) ?? [])
  );
  const [companies, setCompanies] = useState<Company[]>(
    () => getCached<Company[]>(cacheKeys.companies) ?? []
  );
  const [projects, setProjects] = useState<Project[]>(
    () => getCached<Project[]>(cacheKeys.projects) ?? []
  );
  const [currentUser, setCurrentUser] = useState<TodoUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [formDefaultProject, setFormDefaultProject] = useState<string | undefined>();
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterCompany, setFilterCompany] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [myTodosView, setMyTodosView] = useState<"active" | "completed">("active");
  const [filtersReady, setFiltersReady] = useState(false);
  const defaultAssigneeApplied = useRef(false);
  const { requestDelete, confirmDialog } = useConfirmDelete();

  // Reuse layout session — no extra /api/auth/me round-trip on this page
  useEffect(() => {
    if (!sessionReady || defaultAssigneeApplied.current) return;
    defaultAssigneeApplied.current = true;
    if (sessionUser) {
      setCurrentUser({
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name,
      });
      setFilterAssignee(sessionUser.id);
    }
    setFiltersReady(true);
  }, [sessionReady, sessionUser]);

  const load = useCallback(async () => {
    if (!filtersReady) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filterAssignee !== "all") params.set("assignee", filterAssignee);
    if (filterCompany !== "all") params.set("company", filterCompany);
    if (filterStatus !== "all") params.set("status", filterStatus === "active" ? "" : filterStatus);

    const boardParams = new URLSearchParams();
    if (filterAssignee !== "all") boardParams.set("assignee", filterAssignee);
    if (filterStatus !== "all") boardParams.set("status", filterStatus);

    const [todoData, userData, companyData, projectData, boardData] = await Promise.all([
      fetch(`/api/todos?${params}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      getUsers().catch(() => [] as TodoUser[]),
      getCompanies(),
      getProjects(),
      fetch(`/api/tasks/assigned?${boardParams}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]);

    setUsers(userData);
    setCompanies(companyData);
    setProjects(projectData as Project[]);
    setTodos(todoData.map((t: Todo) => ({ ...t, _source: "todo" as const })));
    setBoardTasks(boardData.map((t: ProjectBoardTask) => ({ ...t, _source: "task" as const })));
    setCurrentUser((prev) => {
      const me = userData.find((u: TodoUser) => u.id === prev?.id) ?? prev;
      return me;
    });
    setLoading(false);
  }, [filterAssignee, filterCompany, filterStatus, filtersReady]);

  useEffect(() => { load(); }, [load]);

  function handleTodoUpdate(updated: Todo) {
    setTodos((prev) => {
      const existing = prev.find((x) => x.id === updated.id);
      if (!existing) return prev;

      const merged = { ...existing, ...updated, _source: "todo" as const };

      // Reopening from Recently Completed → pin to top of My To-Dos as Open
      if (existing.status === "done" && updated.status === "open") {
        return [merged, ...prev.filter((x) => x.id !== updated.id)];
      }

      return prev.map((x) => (x.id === updated.id ? merged : x));
    });
  }

  function handleBoardTaskUpdate(updated: Task, milestone?: { name?: string; color?: string }) {
    setBoardTasks((prev) => prev.map((x) => {
      if (x.id !== updated.id) return x;
      return {
        ...x,
        title: updated.title,
        description: updated.description ?? undefined,
        status: updated.status,
        priority: updated.priority,
        assignee: updated.assignee ?? undefined,
        due_date: updated.due_date ?? undefined,
        milestone_id: updated.milestone_id,
        parent_id: updated.parent_id,
        position: updated.position,
        url: updated.url ?? undefined,
        milestone_name: milestone?.name ?? (updated.milestone_id ? x.milestone_name : undefined),
        milestone_color: milestone?.color ?? (updated.milestone_id ? x.milestone_color : undefined),
      };
    }));
  }

  function handleBoardTaskDelete(id: string) {
    const task = boardTasks.find((t) => t.id === id);
    requestDelete({
      title: "Delete task",
      description: (
        <>
          Are you sure you want to delete{" "}
          <span className="text-neutral-300">{task?.title ?? "this task"}</span>?
        </>
      ),
      confirmLabel: "Delete task",
      onConfirm: () => {
        fetch(`/api/tasks/${id}`, { method: "DELETE" });
        setBoardTasks((prev) => prev.filter((t) => t.id !== id));
      },
    });
  }

  function handleDelete(id: string) {
    const todo = todos.find((t) => t.id === id);
    requestDelete({
      title: "Delete task",
      description: (
        <>
          Are you sure you want to delete{" "}
          <span className="text-neutral-300">{todo?.title ?? "this task"}</span>?
        </>
      ),
      confirmLabel: "Delete task",
      onConfirm: () => {
        fetch(`/api/todos/${id}`, { method: "DELETE" });
        setTodos((prev) => prev.filter((t) => t.id !== id));
      },
    });
  }

  function openNewTaskForProject(projectId: string) {
    setEditingTodo(null);
    setFormDefaultProject(projectId);
    setFormOpen(true);
  }

  function openNewTask() {
    setEditingTodo(null);
    setFormDefaultProject(undefined);
    setFormOpen(true);
  }

  function openEditTask(todo: Todo) {
    setEditingTodo(todo);
    setFormDefaultProject(undefined);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingTodo(null);
    setFormDefaultProject(undefined);
  }

  const people = assigneeOptions(users, currentUser);

  // Split todos into personal vs project-linked
  const personalTodos = todos.filter((t) => !t.project_id);
  const projectTodos = todos.filter((t) => !!t.project_id);

  // Build unified project groups: combine todo-based and board-based tasks
  const projectGroups = new Map<string, {
    name: string;
    companyName?: string;
    companyLogoUrl?: string;
    todos: Todo[];
    boardTasks: ProjectBoardTask[];
  }>();

  for (const t of projectTodos) {
    const pid = t.project_id!;
    if (!projectGroups.has(pid)) {
      projectGroups.set(pid, {
        name: t.project_name || "Unknown project",
        companyName: t.project_company_name,
        companyLogoUrl: t.project_company_logo_url,
        todos: [], boardTasks: [],
      });
    }
    projectGroups.get(pid)!.todos.push(t);
  }

  for (const t of boardTasks) {
    const pid = t.project_id;
    if (!projectGroups.has(pid)) {
      projectGroups.set(pid, {
        name: t.project_name || "Unknown project",
        companyName: t.company_name,
        companyLogoUrl: t.company_logo_url,
        todos: [], boardTasks: [],
      });
    }
    const group = projectGroups.get(pid)!;
    if (!group.companyName && t.company_name) {
      group.companyName = t.company_name;
      group.companyLogoUrl = t.company_logo_url;
    }
    group.boardTasks.push(t);
  }

  // Further split personal to-dos
  const personalActive = filterStatus === "done" ? [] : personalTodos.filter((t) => t.status !== "done");
  const personalDone = sortCompletedLatest(personalTodos.filter((t) => t.status === "done"));
  const personalDonePreview = personalDone.slice(0, 3);
  const showCompletedView = myTodosView === "completed" || filterStatus === "done";

  // Stats (include both sources)
  const totalOpen = personalTodos.filter((t) => t.status === "open").length
    + boardTasks.filter((t) => !isDonePhase(t.milestone_name) && t.status === "open").length;
  const totalInProgress = personalTodos.filter((t) => t.status === "in_progress").length
    + boardTasks.filter((t) => !isDonePhase(t.milestone_name) && t.status === "in_progress").length;
  const totalOverdue =
    personalTodos.filter((t) => t.due_date && t.status !== "done" && new Date(t.due_date) < new Date()).length
    + boardTasks.filter((t) => !isDonePhase(t.milestone_name) && t.due_date && new Date(t.due_date) < new Date()).length;
  const totalProjectItems = Array.from(projectGroups.values()).reduce((sum, g) => sum + g.todos.length + g.boardTasks.length, 0);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Tasks</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {totalOpen} open · {totalInProgress} in progress
            {totalOverdue > 0 && <span className="text-red-400 ml-2">· {totalOverdue} overdue</span>}
          </p>
        </div>
        <Button onClick={openNewTask}
          className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2">
          <Plus className="w-4 h-4" /> New task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterAssignee} onValueChange={(v) => setFilterAssignee(v ?? "all")}>
          <SelectTrigger className="w-40 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm">
            <SelectValue>
              {filterAssignee === "all"
                ? "Everyone"
                : assigneeLabel(people, filterAssignee, currentUser)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            <SelectItem value="all" className="text-neutral-400">Everyone</SelectItem>
            {people.map((u) => (
              <SelectItem key={u.id} value={u.id} className="text-neutral-100">{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCompany} onValueChange={(v) => setFilterCompany(v ?? "all")}>
          <SelectTrigger className="w-44 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm">
            <SelectValue>
              {filterCompany === "all"
                ? "All companies"
                : namedOptionLabel(companies, filterCompany, "All companies")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            <SelectItem value="all" className="text-neutral-400">All companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-neutral-100">{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "active")}>
          <SelectTrigger className="w-36 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm">
            <SelectValue>
              {statusFilterLabels[filterStatus] ?? "Active"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            <SelectItem value="active" className="text-neutral-100">Active</SelectItem>
            <SelectItem value="all" className="text-neutral-400">All</SelectItem>
            <SelectItem value="done" className="text-emerald-400">Done</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-neutral-900 rounded-lg animate-pulse border border-neutral-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* =========================================================== */}
          {/* SECTION 1: MY TO-DOS (personal, no project) */}
          {/* =========================================================== */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ListTodo className="w-4 h-4 text-neutral-500" />
              <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
                {showCompletedView ? "Completed To-Dos" : "My To-Dos"}
              </h2>
              <span className="text-xs text-neutral-600 font-mono ml-1">
                {showCompletedView ? personalDone.length : personalActive.length}
              </span>
              <div className="flex-1" />
              {showCompletedView ? (
                <button
                  type="button"
                  onClick={() => setMyTodosView("active")}
                  className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-200 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  My To-Dos
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMyTodosView("completed")}
                  className="text-xs text-neutral-500 hover:text-neutral-200 transition-colors"
                >
                  Completed To-Dos
                  {personalDone.length > 0 && (
                    <span className="text-neutral-600 font-mono ml-1.5">{personalDone.length}</span>
                  )}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {showCompletedView ? (
                <>
                  {personalDone.map((t) => (
                    <TodoRow
                      key={t.id}
                      todo={t}
                      onUpdate={handleTodoUpdate}
                      onDelete={handleDelete}
                      onEdit={openEditTask}
                      allowReopen
                    />
                  ))}
                  {personalDone.length === 0 && (
                    <div className="py-8 text-center border border-dashed border-neutral-800 rounded-lg">
                      <CheckCircle2 className="w-6 h-6 text-neutral-700 mx-auto mb-2" />
                      <p className="text-neutral-600 text-xs">No completed to-dos yet</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <QuickAddTodo
                    onAdd={(t) => { setTodos((prev) => [{ ...t, _source: "todo" as const }, ...prev]); }}
                    currentUser={currentUser}
                  />
                  {personalActive.map((t) => (
                    <TodoRow key={t.id} todo={t} onUpdate={handleTodoUpdate} onDelete={handleDelete} onEdit={openEditTask} />
                  ))}
                  {personalDonePreview.length > 0 && (
                    <>
                      <div className="flex items-center gap-3 pt-2 pb-1">
                        <div className="flex-1 border-t border-neutral-800/60" />
                        <span className="text-[10px] text-neutral-600 uppercase tracking-widest shrink-0">
                          Recently completed
                        </span>
                        <div className="flex-1 border-t border-neutral-800/60" />
                      </div>
                      {personalDonePreview.map((t) => (
                        <TodoRow
                          key={t.id}
                          todo={t}
                          onUpdate={handleTodoUpdate}
                          onDelete={handleDelete}
                          onEdit={openEditTask}
                          allowReopen
                        />
                      ))}
                      {personalDone.length > 3 && (
                        <button
                          type="button"
                          onClick={() => setMyTodosView("completed")}
                          className="w-full py-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                        >
                          View all {personalDone.length} completed to-dos
                        </button>
                      )}
                    </>
                  )}
                  {personalActive.length === 0 && personalDone.length === 0 && (
                    <div className="py-8 text-center border border-dashed border-neutral-800 rounded-lg">
                      <CheckCircle2 className="w-6 h-6 text-neutral-700 mx-auto mb-2" />
                      <p className="text-neutral-600 text-xs">No personal to-dos — all caught up!</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* =========================================================== */}
          {/* SECTION 2: PROJECT TASKS (grouped by project) */}
          {/* =========================================================== */}
          {(projectGroups.size > 0 || filterStatus !== "done") && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <FolderKanban className="w-4 h-4 text-neutral-500" />
                <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
                  Project Tasks
                </h2>
                <span className="text-xs text-neutral-600 font-mono ml-1">
                  {totalProjectItems}
                </span>
              </div>

              {projectGroups.size > 0 ? (
                <div className="space-y-3">
                  {Array.from(projectGroups.entries()).map(([pid, group]) => (
                    <ProjectGroup
                      key={pid}
                      projectId={pid}
                      projectName={group.name}
                      companyName={group.companyName}
                      companyLogoUrl={group.companyLogoUrl}
                      todos={group.todos}
                      boardTasks={group.boardTasks}
                      filterStatus={filterStatus as "active" | "all" | "done"}
                      onTodoUpdate={handleTodoUpdate}
                      onTodoDelete={handleDelete}
                      onTodoEdit={openEditTask}
                      onBoardTaskUpdate={handleBoardTaskUpdate}
                      onBoardTaskDelete={handleBoardTaskDelete}
                      onNewTask={openNewTaskForProject}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center border border-dashed border-neutral-800 rounded-lg">
                  <FolderKanban className="w-6 h-6 text-neutral-700 mx-auto mb-2" />
                  <p className="text-neutral-600 text-xs">No project tasks yet</p>
                  <p className="text-neutral-700 text-xs mt-1">Assign a project when creating a task to see it here</p>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <TodoFormDialog
        open={formOpen}
        onClose={closeForm}
        onSave={() => { load(); }}
        todo={editingTodo}
        users={users}
        companies={companies}
        projects={projects as Project[]}
        currentUser={currentUser}
        defaultProjectId={formDefaultProject}
      />

      {confirmDialog}
    </div>
  );
}

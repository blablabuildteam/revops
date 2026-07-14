"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus, CheckCircle2, Circle, Clock, Trash2,
  Flag, User, Building2, FolderKanban, Calendar,
  ChevronDown, ChevronRight, ListTodo,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { getCompanies, getProjects } from "@/lib/api";
import { Company, Project } from "@/lib/types";
import { formatDate } from "@/lib/format";

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
  due_date?: string;
  created_at: string;
}

const priorityColors = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-neutral-500",
};
const statusIcon = {
  open: <Circle className="w-4 h-4 text-neutral-600" />,
  in_progress: <Clock className="w-4 h-4 text-blue-400" />,
  done: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
};

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

function NewTodoDialog({
  open, onClose, onSave, users, companies, projects, currentUser, defaultProjectId,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (t: Todo) => void;
  users: TodoUser[];
  companies: Company[];
  projects: Project[];
  currentUser: TodoUser | null;
  defaultProjectId?: string;
}) {
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium",
    assignee_id: "",
    company_id: "", project_id: defaultProjectId ?? "", due_date: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const people = assigneeOptions(users, currentUser);

  useEffect(() => {
    if (open && currentUser) {
      setForm((f) => ({
        ...f,
        assignee_id: currentUser.id,
        project_id: defaultProjectId ?? "",
      }));
      setError("");
    }
  }, [open, currentUser, defaultProjectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          assignee_id:
            form.assignee_id === ""
              ? null
              : (form.assignee_id || currentUser?.id || null),
          company_id: form.company_id || null,
          project_id: form.project_id || null,
          due_date: form.due_date || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to create task");
        return;
      }
      onSave(data);
      onClose();
      setForm({
        title: "", description: "", priority: "medium",
        assignee_id: currentUser?.id ?? "",
        company_id: "", project_id: "", due_date: "",
      });
    } finally {
      setLoading(false);
    }
  }

  const s = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
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
              <Select value={form.priority} onValueChange={(v) => s("priority", v ?? "medium")}>
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
            <Input type="date" value={form.due_date} onChange={(e) => s("due_date", e.target.value)}
              className="bg-neutral-800 border-neutral-700 text-neutral-100 font-mono" />
          </div>
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800">Cancel</Button>
            <Button type="submit" disabled={loading}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium">
              {loading ? "Adding..." : "Add"}
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
          priority: "medium",
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
// Compact todo row for the checklist
// ---------------------------------------------------------------------------

function TodoRow({ todo, onUpdate, onDelete }: {
  todo: Todo;
  onUpdate: (t: Todo) => void;
  onDelete: (id: string) => void;
}) {
  const statuses: Todo["status"][] = ["open", "in_progress", "done"];

  function cycleStatus() {
    const next = statuses[(statuses.indexOf(todo.status) + 1) % statuses.length];
    fetch(`/api/todos/${todo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).then((r) => r.json()).then(onUpdate);
  }

  const isOverdue = todo.due_date && todo.status !== "done" &&
    new Date(todo.due_date) < new Date();

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all group ${
      todo.status === "done"
        ? "opacity-50 bg-neutral-900/20 border-neutral-800/50"
        : "bg-neutral-900/40 border-neutral-800 hover:border-neutral-700"
    }`}>
      <button onClick={cycleStatus} className="shrink-0">
        {statusIcon[todo.status]}
      </button>
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <p className={`text-sm leading-snug truncate ${
          todo.status === "done" ? "line-through text-neutral-600" : "text-neutral-200"
        }`}>
          {todo.title}
        </p>
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
      <div className="flex items-center gap-1 shrink-0">
        <Flag className={`w-3 h-3 ${priorityColors[todo.priority]}`} />
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

function TodoCard({ todo, onUpdate, onDelete }: {
  todo: Todo;
  onUpdate: (t: Todo) => void;
  onDelete: (id: string) => void;
}) {
  const statuses: Todo["status"][] = ["open", "in_progress", "done"];

  function cycleStatus() {
    const next = statuses[(statuses.indexOf(todo.status) + 1) % statuses.length];
    fetch(`/api/todos/${todo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).then((r) => r.json()).then(onUpdate);
  }

  const isOverdue = todo.due_date && todo.status !== "done" &&
    new Date(todo.due_date) < new Date();

  return (
    <div className={`flex items-start gap-3 px-3.5 py-2.5 transition-all group ${
      todo.status === "done" ? "opacity-50" : ""
    }`}>
      <button onClick={cycleStatus} className="shrink-0 mt-0.5">
        {statusIcon[todo.status]}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${
          todo.status === "done" ? "line-through text-neutral-600" : "text-neutral-200"
        }`}>
          {todo.title}
        </p>
        {todo.description && (
          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{todo.description}</p>
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
      <div className="flex items-center gap-1 shrink-0">
        <Flag className={`w-3 h-3 ${priorityColors[todo.priority]}`} />
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
  projectId, projectName, todos, onUpdate, onDelete, onNewTask,
}: {
  projectId: string;
  projectName: string;
  todos: Todo[];
  onUpdate: (t: Todo) => void;
  onDelete: (id: string) => void;
  onNewTask: (projectId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const active = todos.filter((t) => t.status !== "done");
  const done = todos.filter((t) => t.status === "done");
  const total = todos.length;
  const doneCount = done.length;

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
        <FolderKanban className="w-4 h-4 text-neutral-500 shrink-0" />
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
        <div className="divide-y divide-neutral-800/40">
          {active.map((t) => (
            <TodoCard key={t.id} todo={t} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
          {done.length > 0 && active.length > 0 && (
            <div className="px-4 py-1.5">
              <span className="text-[10px] text-neutral-600 uppercase tracking-widest">Completed</span>
            </div>
          )}
          {done.map((t) => (
            <TodoCard key={t.id} todo={t} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
          {todos.length === 0 && (
            <p className="text-xs text-neutral-700 px-4 py-3">No tasks yet</p>
          )}
          <div className="px-3 py-2 flex items-center gap-2">
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
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [users, setUsers] = useState<TodoUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentUser, setCurrentUser] = useState<TodoUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formDefaultProject, setFormDefaultProject] = useState<string | undefined>();
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterCompany, setFilterCompany] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterAssignee !== "all") params.set("assignee", filterAssignee);
    if (filterCompany !== "all") params.set("company", filterCompany);
    if (filterStatus !== "all") params.set("status", filterStatus === "active" ? "" : filterStatus);

    const [todoData, userData, companyData, projectData, meData] = await Promise.all([
      fetch(`/api/todos?${params}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/users").then((r) => r.json()).catch(() => []),
      getCompanies(),
      getProjects(),
      fetch("/api/auth/me").then((r) => r.json()),
    ]);

    setTodos(todoData);
    setUsers(userData);
    setCompanies(companyData);
    setProjects(projectData as Project[]);
    setCurrentUser(meData.user ?? null);
    setLoading(false);
  }, [filterAssignee, filterCompany, filterStatus]);

  useEffect(() => { load(); }, [load]);

  function handleUpdate(updated: Todo) {
    setTodos((prev) => prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x));
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    fetch(`/api/todos/${id}`, { method: "DELETE" });
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  function openNewTaskForProject(projectId: string) {
    setFormDefaultProject(projectId);
    setFormOpen(true);
  }

  function openNewTask() {
    setFormDefaultProject(undefined);
    setFormOpen(true);
  }

  const people = assigneeOptions(users, currentUser);

  // Split into personal to-dos vs project tasks
  const personalTodos = todos.filter((t) => !t.project_id);
  const projectTodos = todos.filter((t) => !!t.project_id);

  // Group project tasks by project
  const projectGroups = new Map<string, { name: string; todos: Todo[] }>();
  for (const t of projectTodos) {
    const pid = t.project_id!;
    if (!projectGroups.has(pid)) {
      projectGroups.set(pid, { name: t.project_name || "Unknown project", todos: [] });
    }
    projectGroups.get(pid)!.todos.push(t);
  }

  // Further split personal to-dos
  const personalActive = filterStatus === "done" ? [] : personalTodos.filter((t) => t.status !== "done");
  const personalDone = filterStatus === "done"
    ? personalTodos
    : personalTodos.filter((t) => t.status === "done");

  // Stats
  const totalOpen = todos.filter((t) => t.status === "open").length;
  const totalInProgress = todos.filter((t) => t.status === "in_progress").length;
  const totalOverdue = todos.filter((t) => t.due_date && t.status !== "done" && new Date(t.due_date) < new Date()).length;

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
                My To-Dos
              </h2>
              <span className="text-xs text-neutral-600 font-mono ml-1">
                {personalActive.length}
              </span>
            </div>

            <div className="space-y-1.5">
              <QuickAddTodo
                onAdd={(t) => { setTodos((prev) => [t, ...prev]); }}
                currentUser={currentUser}
              />
              {personalActive.map((t) => (
                <TodoRow key={t.id} todo={t} onUpdate={handleUpdate} onDelete={handleDelete} />
              ))}
              {personalDone.length > 0 && (
                <>
                  <div className="flex items-center gap-3 pt-2 pb-1">
                    <div className="flex-1 border-t border-neutral-800/60" />
                    <span className="text-[10px] text-neutral-600 uppercase tracking-widest shrink-0">
                      Done ({personalDone.length})
                    </span>
                    <div className="flex-1 border-t border-neutral-800/60" />
                  </div>
                  {personalDone.map((t) => (
                    <TodoRow key={t.id} todo={t} onUpdate={handleUpdate} onDelete={handleDelete} />
                  ))}
                </>
              )}
              {personalActive.length === 0 && personalDone.length === 0 && (
                <div className="py-8 text-center border border-dashed border-neutral-800 rounded-lg">
                  <CheckCircle2 className="w-6 h-6 text-neutral-700 mx-auto mb-2" />
                  <p className="text-neutral-600 text-xs">No personal to-dos — all caught up!</p>
                </div>
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
                  {projectTodos.length}
                </span>
              </div>

              {projectGroups.size > 0 ? (
                <div className="space-y-3">
                  {Array.from(projectGroups.entries()).map(([pid, group]) => (
                    <ProjectGroup
                      key={pid}
                      projectId={pid}
                      projectName={group.name}
                      todos={group.todos}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
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

      <NewTodoDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setFormDefaultProject(undefined); }}
        onSave={(t) => { setTodos((prev) => [t, ...prev]); load(); }}
        users={users}
        companies={companies}
        projects={projects as Project[]}
        currentUser={currentUser}
        defaultProjectId={formDefaultProject}
      />
    </div>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, CheckCircle2, Circle, Clock, Trash2,
  Flag, User, Building2, FolderKanban, Calendar,
} from "lucide-react";
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
const priorityBg = {
  high: "bg-red-950/40 border-red-900/40",
  medium: "bg-amber-950/20 border-amber-900/30",
  low: "bg-neutral-900/40 border-neutral-800",
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

function NewTodoDialog({
  open, onClose, onSave, users, companies, projects, currentUser,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (t: Todo) => void;
  users: TodoUser[];
  companies: Company[];
  projects: Project[];
  currentUser: TodoUser | null;
}) {
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium",
    assignee_id: "",
    company_id: "", project_id: "", due_date: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const people = assigneeOptions(users, currentUser);

  useEffect(() => {
    if (open && currentUser) {
      setForm((f) => ({ ...f, assignee_id: currentUser.id }));
      setError("");
    }
  }, [open, currentUser]);

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
    <div className={`flex items-start gap-3 p-3.5 rounded-lg border transition-all group ${todo.status === "done" ? "opacity-50 bg-neutral-900/20 border-neutral-800/50" : priorityBg[todo.priority]}`}>
      <button onClick={cycleStatus} className="shrink-0 mt-0.5">
        {statusIcon[todo.status]}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${todo.status === "done" ? "line-through text-neutral-600" : "text-neutral-200"}`}>
          {todo.title}
        </p>
        {todo.description && (
          <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">{todo.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {todo.assignee_name && (
            <span className="flex items-center gap-1 text-xs text-neutral-400">
              <User className="w-3 h-3 text-neutral-500" /> {todo.assignee_name}
            </span>
          )}
          {todo.company_name && (
            <span className="flex items-center gap-1 text-xs text-neutral-400">
              <Building2 className="w-3 h-3 text-neutral-500" /> {todo.company_name}
            </span>
          )}
          {todo.project_name && (
            <span className="flex items-center gap-1 text-xs text-neutral-400">
              <FolderKanban className="w-3 h-3 text-neutral-500" /> {todo.project_name}
            </span>
          )}
          {todo.due_date && (
            <span className={`flex items-center gap-1 text-xs font-mono ${isOverdue ? "text-red-400" : "text-neutral-400"}`}>
              <Calendar className={`w-3 h-3 ${isOverdue ? "text-red-400" : "text-neutral-500"}`} /> {formatDate(todo.due_date)}
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

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [users, setUsers] = useState<TodoUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentUser, setCurrentUser] = useState<TodoUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
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

  function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    fetch(`/api/todos/${id}`, { method: "DELETE" });
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  const open = todos.filter((t) => t.status === "open").length;
  const inProgress = todos.filter((t) => t.status === "in_progress").length;
  const overdue = todos.filter((t) => t.due_date && t.status !== "done" && new Date(t.due_date) < new Date()).length;

  const people = assigneeOptions(users, currentUser);

  const activeTodos =
    filterStatus === "done" ? [] : todos.filter((t) => t.status !== "done");
  const doneTodos =
    filterStatus === "done"
      ? todos
      : todos.filter((t) => t.status === "done");

  const grouped = {
    high: activeTodos.filter((t) => t.priority === "high"),
    medium: activeTodos.filter((t) => t.priority === "medium"),
    low: activeTodos.filter((t) => t.priority === "low"),
  };

  const hasActiveTasks = activeTodos.length > 0;
  const hasDoneTasks = doneTodos.length > 0;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Tasks</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {open} open · {inProgress} in progress
            {overdue > 0 && <span className="text-red-400 ml-2">· {overdue} overdue</span>}
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}
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
            <div key={i} className="h-16 bg-neutral-900 rounded-lg animate-pulse border border-neutral-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.high.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-red-400 uppercase tracking-widest font-medium flex items-center gap-1.5">
                <Flag className="w-3 h-3" /> High priority
              </p>
              {grouped.high.map((t) => (
                <TodoCard key={t.id} todo={t}
                  onUpdate={(updated) => setTodos((prev) => prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x))}
                  onDelete={handleDelete} />
              ))}
            </div>
          )}
          {grouped.medium.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-amber-400 uppercase tracking-widest font-medium flex items-center gap-1.5">
                <Flag className="w-3 h-3" /> Medium
              </p>
              {grouped.medium.map((t) => (
                <TodoCard key={t.id} todo={t}
                  onUpdate={(updated) => setTodos((prev) => prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x))}
                  onDelete={handleDelete} />
              ))}
            </div>
          )}
          {grouped.low.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500 uppercase tracking-widest font-medium flex items-center gap-1.5">
                <Flag className="w-3 h-3" /> Low
              </p>
              {grouped.low.map((t) => (
                <TodoCard key={t.id} todo={t}
                  onUpdate={(updated) => setTodos((prev) => prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x))}
                  onDelete={handleDelete} />
              ))}
            </div>
          )}
          {hasDoneTasks && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 border-t border-neutral-800" />
                <span className="text-xs text-neutral-500 uppercase tracking-widest font-medium shrink-0">
                  Completed tasks
                </span>
                <div className="flex-1 border-t border-neutral-800" />
              </div>
              <div className="space-y-2">
                {doneTodos.map((t) => (
                  <TodoCard key={t.id} todo={t}
                    onUpdate={(updated) => setTodos((prev) => prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x))}
                    onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}
          {!hasActiveTasks && !hasDoneTasks && (
            <div className="py-20 text-center border border-neutral-800 rounded-lg">
              <CheckCircle2 className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-600 text-sm">No tasks — all caught up!</p>
            </div>
          )}
        </div>
      )}

      <NewTodoDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={(t) => { setTodos((prev) => [t, ...prev]); load(); }}
        users={users}
        companies={companies}
        projects={projects as Project[]}
        currentUser={currentUser}
      />
    </div>
  );
}

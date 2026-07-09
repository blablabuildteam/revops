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
    assignee_id: currentUser?.id ?? "",
    company_id: "", project_id: "", due_date: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, assignee_id: currentUser?.id ?? "" }));
  }, [open, currentUser]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        assignee_id: form.assignee_id || null,
        company_id: form.company_id || null,
        project_id: form.project_id || null,
        due_date: form.due_date || null,
      }),
    });
    const todo = await res.json();
    onSave(todo);
    onClose();
    setForm({ title: "", description: "", priority: "medium", assignee_id: currentUser?.id ?? "", company_id: "", project_id: "", due_date: "" });
    setLoading(false);
  }

  const s = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-lg">
        <DialogHeader>
          <DialogTitle>Nieuwe taak</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Taak *</Label>
            <Input required value={form.title} onChange={(e) => s("title", e.target.value)}
              placeholder="Wat moet er gedaan worden?"
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Toelichting</Label>
            <Textarea value={form.description} onChange={(e) => s("description", e.target.value)}
              placeholder="Optionele details..."
              rows={2} className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Prioriteit</Label>
              <Select value={form.priority} onValueChange={(v) => s("priority", v ?? "medium")}>
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="high" className="text-red-400">Hoog</SelectItem>
                  <SelectItem value="medium" className="text-amber-400">Middel</SelectItem>
                  <SelectItem value="low" className="text-neutral-400">Laag</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Toegewezen aan</Label>
              <Select value={form.assignee_id || "none"} onValueChange={(v) => s("assignee_id", v === "none" ? "" : (v ?? ""))}>
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue placeholder="Kies persoon" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="none" className="text-neutral-400">Niemand</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-neutral-100">{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Klant</Label>
              <Select value={form.company_id || "none"} onValueChange={(v) => s("company_id", v === "none" ? "" : (v ?? ""))}>
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue placeholder="Optioneel" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="none" className="text-neutral-400">Geen klant</SelectItem>
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
                  <SelectValue placeholder="Optioneel" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="none" className="text-neutral-400">Geen project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-neutral-100">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Deadline</Label>
            <Input type="date" value={form.due_date} onChange={(e) => s("due_date", e.target.value)}
              className="bg-neutral-800 border-neutral-700 text-neutral-100 font-mono" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800">Annuleren</Button>
            <Button type="submit" disabled={loading}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium">
              {loading ? "Toevoegen..." : "Toevoegen"}
            </Button>
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
          <p className="text-xs text-neutral-600 mt-0.5 line-clamp-2">{todo.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {todo.assignee_name && (
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              <User className="w-3 h-3" /> {todo.assignee_name}
            </span>
          )}
          {todo.company_name && (
            <span className="flex items-center gap-1 text-xs text-neutral-600">
              <Building2 className="w-3 h-3" /> {todo.company_name}
            </span>
          )}
          {todo.project_name && (
            <span className="flex items-center gap-1 text-xs text-neutral-600">
              <FolderKanban className="w-3 h-3" /> {todo.project_name}
            </span>
          )}
          {todo.due_date && (
            <span className={`flex items-center gap-1 text-xs font-mono ${isOverdue ? "text-red-400" : "text-neutral-600"}`}>
              <Calendar className="w-3 h-3" /> {formatDate(todo.due_date)}
              {isOverdue && " · te laat"}
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
  const [filterStatus, setFilterStatus] = useState("active");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterAssignee !== "all") params.set("assignee", filterAssignee);
    if (filterStatus !== "all") params.set("status", filterStatus === "active" ? "" : filterStatus);

    const [todoData, userData, companyData, projectData, meData] = await Promise.all([
      fetch(`/api/todos?${params}`).then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()).catch(() => []),
      getCompanies(),
      getProjects(),
      fetch("/api/auth/me").then((r) => r.json()),
    ]);

    let filteredTodos = todoData;
    if (filterStatus === "active") {
      filteredTodos = todoData.filter((t: Todo) => t.status !== "done");
    }

    setTodos(filteredTodos);
    setUsers(userData);
    setCompanies(companyData);
    setProjects(projectData as Project[]);
    setCurrentUser(meData.user);
    setLoading(false);
  }, [filterAssignee, filterStatus]);

  useEffect(() => { load(); }, [load]);

  function handleDelete(id: string) {
    if (!confirm("Taak verwijderen?")) return;
    fetch(`/api/todos/${id}`, { method: "DELETE" });
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  const open = todos.filter((t) => t.status === "open").length;
  const inProgress = todos.filter((t) => t.status === "in_progress").length;
  const overdue = todos.filter((t) => t.due_date && t.status !== "done" && new Date(t.due_date) < new Date()).length;

  const grouped = {
    high: todos.filter((t) => t.priority === "high" && t.status !== "done"),
    medium: todos.filter((t) => t.priority === "medium" && t.status !== "done"),
    low: todos.filter((t) => t.priority === "low" && t.status !== "done"),
    done: todos.filter((t) => t.status === "done"),
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Taken</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {open} open · {inProgress} bezig
            {overdue > 0 && <span className="text-red-400 ml-2">· {overdue} te laat</span>}
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}
          className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2">
          <Plus className="w-4 h-4" /> Nieuwe taak
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={filterAssignee} onValueChange={(v) => setFilterAssignee(v ?? "all")}>
          <SelectTrigger className="w-40 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            <SelectItem value="all" className="text-neutral-400">Iedereen</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id} className="text-neutral-100">{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "active")}>
          <SelectTrigger className="w-36 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            <SelectItem value="active" className="text-neutral-100">Actief</SelectItem>
            <SelectItem value="all" className="text-neutral-400">Alles</SelectItem>
            <SelectItem value="done" className="text-emerald-400">Klaar</SelectItem>
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
                <Flag className="w-3 h-3" /> Hoog prioriteit
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
                <Flag className="w-3 h-3" /> Middel
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
                <Flag className="w-3 h-3" /> Laag
              </p>
              {grouped.low.map((t) => (
                <TodoCard key={t.id} todo={t}
                  onUpdate={(updated) => setTodos((prev) => prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x))}
                  onDelete={handleDelete} />
              ))}
            </div>
          )}
          {filterStatus === "all" && grouped.done.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-600 uppercase tracking-widest font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" /> Klaar
              </p>
              {grouped.done.map((t) => (
                <TodoCard key={t.id} todo={t}
                  onUpdate={(updated) => setTodos((prev) => prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x))}
                  onDelete={handleDelete} />
              ))}
            </div>
          )}
          {todos.length === 0 && (
            <div className="py-20 text-center border border-neutral-800 rounded-lg">
              <CheckCircle2 className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-600 text-sm">Geen taken — lekker bezig!</p>
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

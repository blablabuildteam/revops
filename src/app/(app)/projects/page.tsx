"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { Plus, AlertCircle, FolderKanban, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createProject, getCompanies, updateProject, type ProjectWithStats } from "@/lib/api";
import { useProjects } from "@/hooks/use-api-data";
import {
  Company,
  Project,
  TASK_ASSIGNEES,
  parseProjectLeads,
  serializeProjectLeads,
  type ProjectPriority,
} from "@/lib/types";
import { avatarForName, useAssigneeUsers } from "@/components/assignee-select";
import { UserAvatar } from "@/components/user-avatar";
import { parseLocalDate, toDateInputValue } from "@/lib/format";
import { projectScheduleProgress } from "@/lib/project-status";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { CompanyAvatar } from "@/components/company-avatar";
import { PrioritySelect } from "@/components/priority-select";
import { useUndoablePatch } from "@/hooks/use-undoable-patch";
import { getCached, setCached, cacheKeys } from "@/lib/query-cache";
import {
  PROJECT_SORT_DEFAULT_ASC,
  PROJECT_SORT_LABELS,
  PROJECT_SORT_OPTIONS,
  sortProjects,
  type ProjectSortKey,
} from "@/lib/project-sort";

const statusFilterLabels: Record<string, string> = {
  active: "Active",
  all: "All",
  completed: "Completed",
};

const PROJECT_LIST_GRID =
  "grid items-center gap-x-4 px-4 [grid-template-columns:minmax(0,1fr)_5.5rem] md:[grid-template-columns:minmax(0,1fr)_5.5rem_4.75rem_8.25rem_8.25rem] xl:[grid-template-columns:minmax(0,1fr)_5.5rem_4.75rem_8.25rem_8rem_8.25rem]";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

/** Lime stays dim early and brightens as the end date approaches. */
function progressAccent(progress: number, overdue: boolean) {
  if (overdue) {
    return { bar: "rgba(248, 113, 113, 0.8)", label: "rgb(248, 113, 113)" };
  }
  const t = Math.min(1, Math.max(0, progress / 100));
  return {
    bar: `hsl(65 70% ${lerp(32, 66, t).toFixed(1)}% / ${lerp(0.4, 0.95, t).toFixed(2)})`,
    label: `hsl(65 62% ${lerp(40, 68, t).toFixed(1)}%)`,
  };
}

function ProjectSortHeader({
  label,
  column,
  sortKey,
  sortAsc,
  onToggle,
  className,
}: {
  label: string;
  column: ProjectSortKey;
  sortKey: ProjectSortKey;
  sortAsc: boolean;
  onToggle: (key: ProjectSortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  const SortIcon = active ? (sortAsc ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
      title={`Sort by ${label}${active ? (sortAsc ? " (ascending)" : " (descending)") : ""}`}
      aria-label={`Sort by ${label}`}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 uppercase tracking-wide transition-colors cursor-pointer",
        active ? "text-neutral-200" : "text-neutral-600 hover:text-neutral-300",
        className,
      )}
    >
      <span className={active ? "underline decoration-neutral-500 underline-offset-4" : ""}>
        {label}
      </span>
      <SortIcon className={`w-3 h-3 shrink-0 ${active ? "opacity-100" : "opacity-60"}`} />
    </button>
  );
}

function upsertProjectInCache(updated: Project) {
  const prev = getCached<ProjectWithStats[]>(cacheKeys.projects);
  if (!prev) return;
  setCached(
    cacheKeys.projects,
    prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
  );
}

function applyCompanyLogo(companyId: string, logoUrl: string) {
  const prev = getCached<ProjectWithStats[]>(cacheKeys.projects);
  if (prev) {
    setCached(
      cacheKeys.projects,
      prev.map((p) => {
        const id = p.company_id ?? p.company?.id;
        if (id !== companyId) return p;
        return {
          ...p,
          company: p.company ? { ...p.company, logo_url: logoUrl } : p.company,
        };
      }),
    );
  }
  const companies = getCached<Company[]>(cacheKeys.companies);
  if (companies) {
    setCached(
      cacheKeys.companies,
      companies.map((c) => (c.id === companyId ? { ...c, logo_url: logoUrl } : c)),
    );
  }
}

function ProjectDateCell({
  project,
  field,
  placeholder,
  onUpdate,
}: {
  project: ProjectWithStats;
  field: "start_date" | "end_date";
  placeholder: string;
  onUpdate: (p: Project) => void;
}) {
  const patchProject = useUndoablePatch<Project>();
  const overdue =
    field === "end_date" &&
    !!project.end_date &&
    (project.status === "active" || project.status === "on_hold") &&
    startOfDay(parseLocalDate(project.end_date) ?? new Date(0)) < startOfDay(new Date());

  return (
    <DatePicker
      value={toDateInputValue(project[field])}
      placeholder={placeholder}
      size="sm"
      overdue={overdue}
      onChange={(v) => {
        void patchProject({
          item: project,
          patch: { [field]: v || null },
          apply: (id, patch) => updateProject(id, patch),
          onSuccess: onUpdate,
        });
      }}
      className="h-7 w-full bg-neutral-800/50 border-neutral-700/50 text-neutral-400"
    />
  );
}

function ProjectLeadSelect({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (next: string | null) => void;
}) {
  const users = useAssigneeUsers();
  const selected = parseProjectLeads(value);

  function toggle(name: string) {
    const next = selected.includes(name)
      ? selected.filter((n) => n !== name)
      : [...selected, name];
    onChange(serializeProjectLeads(next));
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Project lead">
      {TASK_ASSIGNEES.map((name) => {
        const active = selected.includes(name);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={active}
            aria-label={`${active ? "Unassign" : "Assign"} ${name}`}
            title={name}
            onClick={(e) => {
              e.stopPropagation();
              toggle(name);
            }}
            className={cn(
              "rounded-full p-px transition-opacity",
              active
                ? "opacity-100 ring-2 ring-[#d4e052] ring-offset-1 ring-offset-neutral-900"
                : "opacity-35 hover:opacity-70",
            )}
          >
            <UserAvatar
              name={name}
              avatarUrl={avatarForName(users, name)}
              size="sm"
              className="rounded-full"
            />
          </button>
        );
      })}
    </div>
  );
}

function NewProjectDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (p: Project) => void;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    company_id: "",
    client_name: "",
    client_email: "",
    start_date: "",
    end_date: "",
    priority: "low" as ProjectPriority,
    lead: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getCompanies().then(setCompanies);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const project = await createProject({
        ...form,
        company_id: form.company_id || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        lead: form.lead || undefined,
      });
      onSave(project);
      onClose();
      setForm({
        name: "",
        description: "",
        company_id: "",
        client_name: "",
        client_email: "",
        start_date: "",
        end_date: "",
        priority: "low",
        lead: "",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Project name *</Label>
            <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Heatnest — Website Redesign"
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Company</Label>
              <Select value={form.company_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, company_id: v === "none" ? "" : (v ?? "") }))}>
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="none" className="text-neutral-400">None</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-neutral-100">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Priority</Label>
              <PrioritySelect
                priority={form.priority}
                onChange={(next) => setForm((f) => ({ ...f, priority: next }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Lead</Label>
            <ProjectLeadSelect
              value={form.lead}
              onChange={(next) => setForm((f) => ({ ...f, lead: next ?? "" }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Client contact</Label>
              <Input value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                placeholder="Name"
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Client email</Label>
              <Input type="email" value={form.client_email} onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))}
                placeholder="name@company.com"
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Start date</Label>
              <DatePicker
                value={form.start_date}
                onChange={(v) => setForm((f) => ({ ...f, start_date: v }))}
                className="bg-neutral-800 border-neutral-700 text-neutral-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">End date</Label>
              <DatePicker
                value={form.end_date}
                onChange={(v) => setForm((f) => ({ ...f, end_date: v }))}
                className="bg-neutral-800 border-neutral-700 text-neutral-100"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short project description..."
              rows={2}
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 resize-none" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800">Cancel</Button>
            <Button type="submit" disabled={loading}
              className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium">
              {loading ? "Creating..." : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectRow({
  project,
  onUpdate,
}: {
  project: ProjectWithStats;
  onUpdate: (p: Project) => void;
}) {
  const patchProject = useUndoablePatch<Project>();
  const pendingReqs = Number(project.pending_requests);
  const progress = projectScheduleProgress(project.start_date, project.end_date);
  const overdue =
    progress === 100 &&
    (project.status === "active" || project.status === "on_hold");
  const accent = progressAccent(progress ?? 0, overdue);
  const company = project.company as { id?: string; logo_url?: string; name?: string } | undefined;
  const companyId = project.company_id ?? company?.id;

  return (
    <div className={`${PROJECT_LIST_GRID} py-2.5 bg-neutral-900/40 hover:bg-neutral-900/70 transition-colors group`}>
      <div className="flex items-center gap-3 min-w-0">
        {company?.name && companyId ? (
          <CompanyAvatar
            id={companyId}
            name={company.name}
            logoUrl={company.logo_url}
            size="md"
            uploadable
            onLogoChange={(logoUrl) => applyCompanyLogo(companyId, logoUrl)}
          />
        ) : (
          <div className="w-8 h-8 rounded-md bg-neutral-800 border border-neutral-700 shrink-0" />
        )}
        <Link href={`/projects/${project.id}`} className="flex items-center min-w-0 flex-1">
        <p className="min-w-0 text-sm text-neutral-200 group-hover:text-white transition-colors truncate flex items-center gap-1.5">
          <span className="truncate">
            {company?.name ? (
              <>
                <span className="text-neutral-400">{company.name}</span>
                <span className="text-neutral-600"> · </span>
              </>
            ) : null}
            {project.name}
          </span>
          {pendingReqs > 0 && (
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-neutral-400 shrink-0">
              <AlertCircle className="w-3 h-3" />
              {pendingReqs}
            </span>
          )}
        </p>
        </Link>
      </div>
      <div className="flex justify-center">
        <PrioritySelect
          iconOnly
          priority={project.priority ?? "low"}
          onChange={(next) => {
            void patchProject({
              item: project,
              patch: { priority: next },
              apply: (id, patch) => updateProject(id, patch),
              onSuccess: onUpdate,
            });
          }}
        />
      </div>
      <div className="hidden md:block min-w-0">
        <ProjectLeadSelect
          value={project.lead}
          onChange={(next) => {
            void patchProject({
              item: project,
              patch: { lead: next },
              apply: (id, patch) => updateProject(id, patch),
              onSuccess: onUpdate,
            });
          }}
        />
      </div>
      <div className="hidden md:block min-w-0">
        <ProjectDateCell
          project={project}
          field="start_date"
          placeholder="Start"
          onUpdate={onUpdate}
        />
      </div>
      <div className="hidden xl:flex items-center gap-2 min-w-0">
        <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress ?? 0}%`,
              backgroundColor: accent.bar,
            }}
          />
        </div>
        <span
          className={`text-[11px] font-mono tabular-nums w-10 shrink-0 text-right ${
            progress == null ? "text-neutral-500" : ""
          }`}
          style={{ color: progress == null ? undefined : accent.label }}
        >
          {progress == null ? "—" : `${progress}%`}
        </span>
      </div>
      <div className="hidden md:block min-w-0">
        <ProjectDateCell
          project={project}
          field="end_date"
          placeholder="End"
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { data: projects = [], isLoading, mutate } = useProjects();
  const loading = isLoading && projects.length === 0;
  const [formOpen, setFormOpen] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [sortKey, setSortKey] = useState<ProjectSortKey>("priority");
  const [sortAsc, setSortAsc] = useState(PROJECT_SORT_DEFAULT_ASC.priority);

  const { companyChips, unassignedCount } = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    let unassigned = 0;

    for (const project of projects) {
      const companyId = project.company_id ?? project.company?.id;
      const companyName = project.company?.name;
      if (companyId && companyName) {
        const existing = map.get(companyId);
        if (existing) existing.count += 1;
        else map.set(companyId, { id: companyId, name: companyName, count: 1 });
      } else {
        unassigned += 1;
      }
    }

    return {
      companyChips: Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)),
      unassignedCount: unassigned,
    };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter === "active" && p.status !== "active" && p.status !== "on_hold") {
        return false;
      }
      if (statusFilter === "completed" && p.status !== "completed") return false;
      if (companyFilter === "none") return !(p.company_id ?? p.company?.id);
      if (companyFilter !== "all") {
        return (p.company_id ?? p.company?.id) === companyFilter;
      }
      return true;
    });
  }, [projects, companyFilter, statusFilter]);

  const sortedProjects = useMemo(
    () => sortProjects(filteredProjects, sortKey, sortAsc),
    [filteredProjects, sortKey, sortAsc],
  );

  function toggleSort(column: ProjectSortKey) {
    if (sortKey === column) setSortAsc((current) => !current);
    else {
      setSortKey(column);
      setSortAsc(PROJECT_SORT_DEFAULT_ASC[column]);
    }
  }

  const active = filteredProjects.filter((p) => p.status === "active");
  const totalTasks = filteredProjects.reduce((s, p) => s + Number(p.task_count), 0);
  const totalDone = filteredProjects.reduce((s, p) => s + Number(p.done_count), 0);
  const pendingRequests = filteredProjects.reduce((s, p) => s + Number(p.pending_requests), 0);

  const showCompanyFilters = companyChips.length > 0 || unassignedCount > 0;

  function toggleCompanyFilter(value: string) {
    setCompanyFilter((current) => (current === value ? "all" : value));
  }

  const chipClass = (activeChip: boolean) =>
    cn(
      "px-3 py-1 rounded-full text-xs font-medium transition-colors border shrink-0",
      activeChip
        ? "bg-[#d4e052]/10 text-[#d4e052] border-[#d4e052]/30"
        : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-neutral-300"
    );

  return (
    <div className="page-shell space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-neutral-100">Projects</h1>
          <p className="text-[13px] sm:text-sm text-neutral-500 mt-0.5">
            {active.length} active · {totalDone}/{totalTasks} tasks done
            {(companyFilter !== "all" || statusFilter !== "all") && (
              <span className="text-neutral-600">
                {" "}
                · {filteredProjects.length} of {projects.length} shown
              </span>
            )}
            {pendingRequests > 0 && (
              <span className="ml-2 text-neutral-400 font-medium">· {pendingRequests} request{pendingRequests !== 1 ? "s" : ""} pending</span>
            )}
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}
          className="w-full sm:w-auto bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium gap-2">
          <Plus className="w-4 h-4" />
          New project
        </Button>
      </div>

      <div className="flex gap-2 sm:gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "active")}>
          <SelectTrigger className="w-36 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm">
            <SelectValue>
              {statusFilterLabels[statusFilter] ?? "Active"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            <SelectItem value="active" className="text-neutral-100">Active</SelectItem>
            <SelectItem value="all" className="text-neutral-400">All</SelectItem>
            <SelectItem value="completed" className="text-stone-300">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortKey}
          onValueChange={(v) => {
            const next = (v ?? "priority") as ProjectSortKey;
            setSortKey(next);
            setSortAsc(PROJECT_SORT_DEFAULT_ASC[next]);
          }}
        >
          <SelectTrigger
            aria-label="Sort projects"
            className="w-44 bg-neutral-900 border-neutral-700 text-neutral-100 h-8 text-sm"
          >
            <SelectValue>
              <span className="flex items-center gap-1.5 min-w-0">
                <ArrowUpDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <span className="truncate">{PROJECT_SORT_LABELS[sortKey]}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            {PROJECT_SORT_OPTIONS.map((key) => (
              <SelectItem key={key} value={key} className="text-neutral-100">
                {PROJECT_SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!loading && showCompanyFilters && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCompanyFilter("all")}
            className={chipClass(companyFilter === "all")}
          >
            All ({projects.length})
          </button>
          {companyChips.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => toggleCompanyFilter(company.id)}
              className={chipClass(companyFilter === company.id)}
            >
              {company.name} ({company.count})
            </button>
          ))}
          {unassignedCount > 0 && (
            <button
              type="button"
              onClick={() => toggleCompanyFilter("none")}
              className={chipClass(companyFilter === "none")}
            >
              No company ({unassignedCount})
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="border border-neutral-800 rounded-lg overflow-hidden divide-y divide-neutral-800/60">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse bg-neutral-900/40" />
          ))}
        </div>
      ) : sortedProjects.length === 0 ? (
        <div className="border border-neutral-800 rounded-lg py-20 text-center">
          <FolderKanban className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-600 text-sm">
            {projects.length === 0 ? "No projects yet" : "No projects match this filter"}
          </p>
        </div>
      ) : (
        <div className="border border-neutral-800 rounded-lg overflow-hidden">
          <div className={`${PROJECT_LIST_GRID} py-2 text-[11px] border-b border-neutral-800`}>
            <ProjectSortHeader label="Project" column="name" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} />
            <ProjectSortHeader label="Priority" column="priority" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} className="justify-self-center" />
            <ProjectSortHeader label="Lead" column="lead" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} className="hidden md:inline-flex" />
            <ProjectSortHeader label="Start" column="start_date" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} className="hidden md:inline-flex" />
            <ProjectSortHeader label="Progress" column="progress" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} className="hidden xl:inline-flex" />
            <ProjectSortHeader label="End" column="end_date" sortKey={sortKey} sortAsc={sortAsc} onToggle={toggleSort} className="hidden md:inline-flex" />
          </div>
          <div className="divide-y divide-neutral-800/60">
            {sortedProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                onUpdate={upsertProjectInCache}
              />
            ))}
          </div>
        </div>
      )}

      <NewProjectDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={() => { void mutate(); }}
      />
    </div>
  );
}

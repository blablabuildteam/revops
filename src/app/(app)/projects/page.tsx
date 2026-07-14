"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { Plus, Copy, Check, ExternalLink, AlertCircle, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getProjects, getCompanies, createProject } from "@/lib/api";
import { Company, Project, PROJECT_STATUS_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

type ProjectWithStats = Project & {
  task_count: number;
  done_count: number;
  pending_requests: number;
};

const statusColors: Record<string, string> = {
  active: "bg-[#e8ff47]/10 text-[#e8ff47]",
  on_hold: "bg-neutral-800 text-neutral-500",
  completed: "bg-emerald-950 text-emerald-400",
  cancelled: "bg-red-950 text-red-500",
};

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/project/${token}`;

  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={(e) => { e.preventDefault(); copy(); }}
      className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-300 transition-colors"
      title="Copy client link"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Client link"}
    </button>
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
      });
      onSave(project);
      onClose();
      setForm({ name: "", description: "", company_id: "", client_name: "", client_email: "", start_date: "", end_date: "" });
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
              <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="bg-neutral-800 border-neutral-700 text-neutral-100 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">End date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className="bg-neutral-800 border-neutral-700 text-neutral-100 font-mono" />
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
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium">
              {loading ? "Creating..." : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  useEffect(() => {
    getProjects().then((p) => { setProjects(p as ProjectWithStats[]); setLoading(false); });
  }, []);

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
    if (companyFilter === "all") return projects;
    if (companyFilter === "none") {
      return projects.filter((p) => !(p.company_id ?? p.company?.id));
    }
    return projects.filter(
      (p) => (p.company_id ?? p.company?.id) === companyFilter
    );
  }, [projects, companyFilter]);

  const active = filteredProjects.filter((p) => p.status === "active");
  const totalTasks = filteredProjects.reduce((s, p) => s + Number(p.task_count), 0);
  const totalDone = filteredProjects.reduce((s, p) => s + Number(p.done_count), 0);
  const pendingRequests = filteredProjects.reduce((s, p) => s + Number(p.pending_requests), 0);

  const showCompanyFilters = companyChips.length > 0 || unassignedCount > 0;

  function toggleCompanyFilter(value: string) {
    setCompanyFilter((current) => (current === value ? "all" : value));
  }

  const chipClass = (active: boolean) =>
    cn(
      "px-3 py-1 rounded-full text-xs font-medium transition-colors border shrink-0",
      active
        ? "bg-[#e8ff47]/10 text-[#e8ff47] border-[#e8ff47]/30"
        : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-neutral-300"
    );

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Projects</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {active.length} active · {totalDone}/{totalTasks} tasks done
            {companyFilter !== "all" && (
              <span className="text-neutral-600">
                {" "}
                · {filteredProjects.length} of {projects.length} shown
              </span>
            )}
            {pendingRequests > 0 && (
              <span className="ml-2 text-orange-400 font-medium">· {pendingRequests} request{pendingRequests !== 1 ? "s" : ""} pending</span>
            )}
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}
          className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2">
          <Plus className="w-4 h-4" />
          New project
        </Button>
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
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="border border-neutral-800 rounded-lg h-40 animate-pulse bg-neutral-900/40" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="border border-neutral-800 rounded-lg py-20 text-center">
          <FolderKanban className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-600 text-sm">
            {projects.length === 0 ? "No projects yet" : "No projects match this filter"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProjects.map((project) => {
            const taskCount = Number(project.task_count);
            const doneCount = Number(project.done_count);
            const pendingReqs = Number(project.pending_requests);
            const progress = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0;

            return (
              <Link key={project.id} href={`/projects/${project.id}`}
                className="block border border-neutral-800 rounded-lg p-5 hover:border-neutral-700 transition-colors bg-neutral-900/20 group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {(project.company as { logo_url?: string; name?: string })?.name && (
                      <CompanyAvatar
                        name={(project.company as { name?: string }).name!}
                        logoUrl={(project.company as { logo_url?: string }).logo_url}
                        size="md"
                        className="mt-0.5"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded font-mono ${statusColors[project.status]}`}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </span>
                      {pendingReqs > 0 && (
                        <span className="flex items-center gap-1 text-xs text-orange-400">
                          <AlertCircle className="w-3 h-3" />
                          {pendingReqs} request
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-neutral-200 group-hover:text-white transition-colors truncate">
                      {project.name}
                    </h3>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      {(project.company as { name?: string })?.name || "—"}
                      {project.client_name && ` · ${project.client_name}`}
                    </p>
                  </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-neutral-700 group-hover:text-neutral-500 shrink-0 ml-2 mt-1" />
                </div>

                {project.description && (
                  <p className="text-xs text-neutral-600 mb-3 line-clamp-2">{project.description}</p>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-600">Progress</span>
                    <span className="font-mono text-neutral-400">{doneCount}/{taskCount} tasks</span>
                  </div>
                  <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#e8ff47]/60 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-800">
                  <div className="text-xs text-neutral-700 font-mono">
                    {project.start_date && formatDate(project.start_date)}
                    {project.start_date && project.end_date && " → "}
                    {project.end_date && formatDate(project.end_date)}
                  </div>
                  <CopyLink token={project.share_token} />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <NewProjectDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={(p) => setProjects((prev) => [p as ProjectWithStats, ...prev])}
      />
    </div>
  );
}

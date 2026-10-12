"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUndoToast } from "@/components/mutation-provider";
import { useCompanies, useTools } from "@/hooks/use-api-data";
import {
  createTool,
  deleteTool,
  updateTool,
  upsertToolUsage,
} from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import {
  addMonths,
  billableAmount,
  formatMonthLabel,
  isInvoiced,
  isPassThrough,
  monthKeyOf,
  monthTotal,
  monthlyFixedCost,
  toolActiveInMonth,
  usageForMonth,
} from "@/lib/tools";
import {
  TOOL_CATEGORY_LABELS,
  TOOL_COST_TYPE_LABELS,
  TOOL_STATUS_LABELS,
  type ToolBillingFrequency,
  type ToolCategory,
  type ToolCostType,
  type ToolStatus,
  type ToolWithUsage,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  vendor: string;
  category: ToolCategory;
  cost_type: ToolCostType;
  billing_frequency: ToolBillingFrequency;
  our_cost: string;
  status: ToolStatus;
  start_date: string;
  end_date: string;
  bill_to_company_id: string;
  pass_through: boolean;
  notes: string;
  login_url: string;
  logo_url: string;
};

const blankForm = (): FormState => ({
  name: "",
  vendor: "",
  category: "software",
  cost_type: "fixed",
  billing_frequency: "monthly",
  our_cost: "",
  status: "active",
  start_date: "",
  end_date: "",
  bill_to_company_id: "",
  pass_through: true,
  notes: "",
  login_url: "",
  logo_url: "",
});

function ToolForm({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: ToolWithUsage | null;
}) {
  const { data: companies = [] } = useCompanies();
  const [form, setForm] = useState<FormState>(blankForm);
  const [loading, setLoading] = useState(false);
  const withUndo = useUndoToast();

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name,
        vendor: initial.vendor ?? "",
        category: initial.category,
        cost_type: initial.cost_type,
        billing_frequency: initial.billing_frequency,
        our_cost: String(initial.our_cost || ""),
        status: initial.status,
        start_date: initial.start_date ?? "",
        end_date: initial.end_date ?? "",
        bill_to_company_id: initial.bill_to_company_id ?? "",
        pass_through: initial.pass_through,
        notes: initial.notes ?? "",
        login_url: initial.login_url ?? "",
        logo_url: initial.logo_url ?? "",
      });
    } else {
      setForm(blankForm());
    }
  }, [open, initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);
    const payload = {
      name: form.name.trim(),
      vendor: form.vendor.trim() || null,
      category: form.category,
      cost_type: form.cost_type,
      billing_frequency: form.billing_frequency,
      our_cost: parseFloat(form.our_cost) || 0,
      status: form.status,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      bill_to_company_id: form.bill_to_company_id || null,
      pass_through: form.bill_to_company_id ? form.pass_through : false,
      notes: form.notes.trim() || null,
      login_url: form.login_url.trim() || null,
      logo_url: form.logo_url.trim() || null,
    };
    try {
      if (initial) {
        const snapshot = { ...initial };
        await withUndo({
          label: "Tool bijgewerkt",
          run: async () => {
            await updateTool(initial.id, payload);
          },
          undo: async () => {
            await updateTool(initial.id, {
              name: snapshot.name,
              vendor: snapshot.vendor,
              category: snapshot.category,
              cost_type: snapshot.cost_type,
              billing_frequency: snapshot.billing_frequency,
              our_cost: snapshot.our_cost,
              status: snapshot.status,
              start_date: snapshot.start_date,
              end_date: snapshot.end_date,
              bill_to_company_id: snapshot.bill_to_company_id,
              pass_through: snapshot.pass_through,
              notes: snapshot.notes,
              login_url: snapshot.login_url,
              logo_url: snapshot.logo_url,
            });
          },
        });
      } else {
        await createTool(payload);
      }
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Tool bewerken" : "Nieuwe tool"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-neutral-500">Naam *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Cursor, Vercel, OpenAI…"
              className="bg-neutral-950 border-neutral-700"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-500">Vendor</Label>
              <Input
                value={form.vendor}
                onChange={(e) => set("vendor", e.target.value)}
                className="bg-neutral-950 border-neutral-700"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-500">Categorie</Label>
              <Select
                value={form.category}
                onValueChange={(v) => set("category", (v ?? "other") as ToolCategory)}
              >
                <SelectTrigger className="bg-neutral-950 border-neutral-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TOOL_CATEGORY_LABELS) as ToolCategory[]).map(
                    (c) => (
                      <SelectItem key={c} value={c}>
                        {TOOL_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-500">Kostentype</Label>
              <Select
                value={form.cost_type}
                onValueChange={(v) =>
                  set("cost_type", (v ?? "fixed") as ToolCostType)
                }
              >
                <SelectTrigger className="bg-neutral-950 border-neutral-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TOOL_COST_TYPE_LABELS) as ToolCostType[]).map(
                    (c) => (
                      <SelectItem key={c} value={c}>
                        {TOOL_COST_TYPE_LABELS[c]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-500">Frequentie</Label>
              <Select
                value={form.billing_frequency}
                onValueChange={(v) =>
                  set(
                    "billing_frequency",
                    (v ?? "monthly") as ToolBillingFrequency,
                  )
                }
              >
                <SelectTrigger className="bg-neutral-950 border-neutral-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Maandelijks</SelectItem>
                  <SelectItem value="yearly">Jaarlijks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.cost_type !== "usage" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-500">
                Vast bedrag ({form.billing_frequency === "yearly" ? "jaar" : "maand"})
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.our_cost}
                onChange={(e) => set("our_cost", e.target.value)}
                placeholder="0"
                className="bg-neutral-950 border-neutral-700 font-mono"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-500">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  set("status", (v ?? "active") as ToolStatus)
                }
              >
                <SelectTrigger className="bg-neutral-950 border-neutral-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TOOL_STATUS_LABELS) as ToolStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {TOOL_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-500">Doorbelasten aan</Label>
              <Select
                value={form.bill_to_company_id || "__none__"}
                onValueChange={(v) =>
                  set("bill_to_company_id", !v || v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger className="bg-neutral-950 border-neutral-700">
                  <SelectValue placeholder="Intern" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Intern (geen klant)</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.bill_to_company_id && (
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={form.pass_through}
                onChange={(e) => set("pass_through", e.target.checked)}
                className="rounded border-neutral-600"
              />
              Pass-through factureren (zelfde bedrag)
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-500">Start</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                className="bg-neutral-950 border-neutral-700 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-500">Einde</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                className="bg-neutral-950 border-neutral-700 font-mono"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-neutral-500">Login / portal URL</Label>
            <Input
              value={form.login_url}
              onChange={(e) => set("login_url", e.target.value)}
              placeholder="https://"
              className="bg-neutral-950 border-neutral-700"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-neutral-500">Logo URL</Label>
            <Input
              value={form.logo_url}
              onChange={(e) => set("logo_url", e.target.value)}
              placeholder="/tools/cursor.png"
              className="bg-neutral-950 border-neutral-700 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-neutral-500">Notities</Label>
            <Input
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="bg-neutral-950 border-neutral-700"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-neutral-400"
            >
              Annuleren
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950"
            >
              {loading ? "Opslaan…" : initial ? "Opslaan" : "Toevoegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsageCell({
  tool,
  month,
}: {
  tool: ToolWithUsage;
  month: string;
}) {
  const withUndo = useUndoToast();
  const existing = usageForMonth(tool, month);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(existing ? String(existing.amount) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(existing ? String(existing.amount) : "");
    setEditing(false);
  }, [existing?.amount, month, tool.id]);

  if (tool.cost_type === "fixed") {
    return (
      <span className="text-xs text-neutral-600 font-mono">—</span>
    );
  }

  async function save() {
    const amount = parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) return;
    setSaving(true);
    const prev = existing?.amount ?? null;
    try {
      await withUndo({
        label: "Usage opgeslagen",
        run: async () => {
          await upsertToolUsage(tool.id, { month, amount });
        },
        undo: async () => {
          if (prev == null) {
            await upsertToolUsage(tool.id, { month, amount: 0 });
          } else {
            await upsertToolUsage(tool.id, { month, amount: prev });
          }
        },
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-mono text-neutral-300 hover:text-[#d4e052] tabular-nums"
        title="Usage bewerken"
      >
        {existing ? formatCurrency(existing.amount) : "+ usage"}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex items-center gap-1"
    >
      <Input
        autoFocus
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 w-20 bg-neutral-950 border-neutral-700 font-mono text-xs"
      />
      <Button
        type="submit"
        disabled={saving}
        className="h-7 px-2 bg-[#d4e052] text-neutral-950 text-xs"
      >
        OK
      </Button>
    </form>
  );
}

export default function ToolsPage() {
  const { data: tools = [], isLoading } = useTools();
  const loading = isLoading && tools.length === 0;
  const [month, setMonth] = useState(() => monthKeyOf());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ToolWithUsage | null>(null);
  const withUndo = useUndoToast();

  const activeTools = useMemo(
    () => tools.filter((t) => toolActiveInMonth(t, month)),
    [tools, month],
  );

  const totals = useMemo(() => {
    let internal = 0;
    let billable = 0;
    let openBillable = 0;
    for (const t of activeTools) {
      const total = monthTotal(t, month);
      if (isPassThrough(t)) {
        billable += total;
        if (!isInvoiced(t, month) && total > 0) openBillable += total;
      } else {
        internal += total;
      }
    }
    return { internal, billable, openBillable };
  }, [activeTools, month]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; tools: ToolWithUsage[] }>();
    for (const t of activeTools) {
      const key = t.bill_to_company_id ?? "__internal__";
      const label = t.bill_to_company_name?.trim() || "Intern";
      const group = map.get(key) ?? { label, tools: [] };
      group.tools.push(t);
      map.set(key, group);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === "__internal__") return 1;
      if (b[0] === "__internal__") return -1;
      return a[1].label.localeCompare(b[1].label, "nl");
    });
  }, [activeTools]);

  async function toggleInvoiced(tool: ToolWithUsage) {
    await withUndo({
      label: isInvoiced(tool, month)
        ? "Factuur-check verwijderd"
        : "Gemarkeerd als gefactureerd",
      run: async () => {
        await updateTool(tool.id, { toggle_period: month });
      },
      undo: async () => {
        await updateTool(tool.id, { toggle_period: month });
      },
    });
  }

  async function handleDelete(tool: ToolWithUsage) {
    const snapshot = tool;
    await withUndo({
      label: "Tool verwijderd",
      run: async () => {
        await deleteTool(tool.id);
      },
      undo: async () => {
        await createTool({
          name: snapshot.name,
          vendor: snapshot.vendor,
          category: snapshot.category,
          cost_type: snapshot.cost_type,
          billing_frequency: snapshot.billing_frequency,
          our_cost: snapshot.our_cost,
          currency: snapshot.currency,
          status: snapshot.status,
          start_date: snapshot.start_date,
          end_date: snapshot.end_date,
          bill_to_company_id: snapshot.bill_to_company_id,
          pass_through: snapshot.pass_through,
          notes: snapshot.notes,
          login_url: snapshot.login_url,
          logo_url: snapshot.logo_url,
        });
      },
    });
  }

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-neutral-100">
            Tools
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Licenties, usage &amp; doorbelasten (pass-through)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 border border-neutral-800 rounded-lg bg-neutral-900/40 px-1">
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              className="p-2 text-neutral-500 hover:text-neutral-200"
              aria-label="Vorige maand"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-neutral-200 min-w-[9rem] text-center px-2 capitalize">
              {formatMonthLabel(month)}
            </span>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="p-2 text-neutral-500 hover:text-neutral-200"
              aria-label="Volgende maand"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setMonth(monthKeyOf())}
              className="text-[11px] text-neutral-500 hover:text-neutral-300 px-2 py-1"
            >
              Nu
            </button>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Tool
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Interne kosten</p>
          <p className="text-lg font-mono text-neutral-200 font-medium">
            {formatCurrency(totals.internal)}
          </p>
          <p className="text-[11px] text-neutral-600 mt-0.5">
            Deze maand · niet doorbelast
          </p>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Te factureren</p>
          <p className="text-lg font-mono text-[#d4e052] font-medium">
            {formatCurrency(totals.billable)}
          </p>
          <p className="text-[11px] text-neutral-600 mt-0.5">
            Pass-through deze maand
          </p>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Nog open</p>
          <p className="text-lg font-mono text-amber-300/90 font-medium">
            {formatCurrency(totals.openBillable)}
          </p>
          <p className="text-[11px] text-neutral-600 mt-0.5">
            Nog niet afgevinkt als gefactureerd
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-32 border border-neutral-800 rounded-lg animate-pulse" />
          <div className="h-32 border border-neutral-800 rounded-lg animate-pulse" />
        </div>
      ) : activeTools.length === 0 ? (
        <div className="py-20 text-center border border-neutral-800 rounded-lg">
          <Wrench className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-600 text-sm">
            Geen actieve tools in {formatMonthLabel(month)}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([key, group]) => (
            <section key={key} className="space-y-2">
              <h2 className="text-xs uppercase tracking-wide text-neutral-500 px-0.5">
                {group.label}
              </h2>
              <div className="border border-neutral-800 rounded-lg overflow-hidden divide-y divide-neutral-800/80">
                {group.tools.map((tool) => {
                  const total = monthTotal(tool, month);
                  const fixed = monthlyFixedCost(tool);
                  const pass = isPassThrough(tool);
                  const done = isInvoiced(tool, month);
                  return (
                    <div
                      key={tool.id}
                      className="px-4 py-3 bg-neutral-950/30 flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(tool);
                          setFormOpen(true);
                        }}
                        className="flex-1 min-w-0 text-left flex items-start gap-3"
                      >
                        <span className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center shrink-0 overflow-hidden border border-neutral-700/80">
                          {tool.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={tool.logo_url}
                              alt=""
                              className="w-full h-full object-contain p-1"
                            />
                          ) : (
                            <Wrench className="w-3.5 h-3.5 text-neutral-500" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-neutral-100">
                            {tool.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                            {TOOL_COST_TYPE_LABELS[tool.cost_type]}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500">
                            {TOOL_CATEGORY_LABELS[tool.category]}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-600 mt-0.5">
                          {tool.vendor ? `${tool.vendor} · ` : ""}
                          {tool.cost_type !== "usage" && (
                            <>
                              vast {formatCurrency(fixed)}
                              {tool.billing_frequency === "yearly"
                                ? "/m (jaar/12)"
                                : "/m"}
                            </>
                          )}
                          {tool.notes ? ` · ${tool.notes}` : ""}
                        </p>
                        </span>
                      </button>

                      <div className="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0">
                        <div className="text-right min-w-[4.5rem]">
                          <p className="text-[10px] text-neutral-600 uppercase">
                            Usage
                          </p>
                          <UsageCell tool={tool} month={month} />
                        </div>
                        <div className="text-right min-w-[4.5rem]">
                          <p className="text-[10px] text-neutral-600 uppercase">
                            Totaal
                          </p>
                          <p className="text-sm font-mono text-neutral-200 tabular-nums">
                            {formatCurrency(total)}
                          </p>
                        </div>
                        {pass ? (
                          <button
                            type="button"
                            onClick={() => void toggleInvoiced(tool)}
                            disabled={total <= 0}
                            title="Afvinken als gefactureerd"
                            className={cn(
                              "inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-colors",
                              done
                                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                : total > 0
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-400/50"
                                  : "border-neutral-800 text-neutral-600",
                            )}
                          >
                            <span
                              className={cn(
                                "w-3 h-3 rounded-sm border flex items-center justify-center",
                                done
                                  ? "border-emerald-400"
                                  : "border-neutral-600",
                              )}
                            >
                              {done && <Check className="w-2 h-2" />}
                            </span>
                            Factuur
                          </button>
                        ) : (
                          <span className="text-[11px] text-neutral-700 px-2">
                            Intern
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDelete(tool)}
                          className="p-1.5 text-neutral-700 hover:text-red-400"
                          title="Verwijderen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <ToolForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        initial={editing}
      />
    </div>
  );
}

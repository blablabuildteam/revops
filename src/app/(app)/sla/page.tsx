"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState, useEffect } from "react";
import {
  Plus,
  Shield,
  ExternalLink,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useUndoToast } from "@/components/mutation-provider";
import { useSlaAgreements } from "@/hooks/use-api-data";
import {
  createSlaAgreement,
  deleteSlaAgreement,
  updateSlaAgreement,
} from "@/lib/api";
import { formatCurrency, toDateInputValue } from "@/lib/format";
import {
  buildSlaYearPeriods,
  formatSlaPeriodLabel,
  normalizeInvoicedPeriods,
  slaInvoiceAmount,
  toggleSlaPeriod,
} from "@/lib/sla";
import {
  SlaAgreement,
  SlaBillingFrequency,
  SlaStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<SlaStatus, string> = {
  active: "Actief",
  upcoming: "Komt eraan",
  paused: "Gepauzeerd",
  ended: "Gestopt",
};

type FormState = {
  client_name: string;
  domain: string;
  monthly_amount: string;
  billing_frequency: SlaBillingFrequency;
  invoice_via: string;
  status: SlaStatus;
  notes: string;
  start_date: string;
};

const blankForm: FormState = {
  client_name: "",
  domain: "",
  monthly_amount: "",
  billing_frequency: "monthly",
  invoice_via: "",
  status: "active",
  notes: "",
  start_date: `${new Date().getFullYear()}-01-01`,
};

type ClientGroup = {
  key: string;
  client_name: string;
  rows: SlaAgreement[];
  status: SlaStatus;
  billing_frequency: SlaBillingFrequency;
  monthly_total: number;
  invoice_via: string | null;
  notes: string | null;
  start_date: string | null;
  invoiced_periods: string[];
  open_periods: string[];
  current_period: string;
  billable: SlaAgreement[];
};

function domainHref(domain: string) {
  if (/^https?:\/\//i.test(domain)) return domain;
  return `https://${domain}`;
}

function formatDomain(domain: string) {
  return domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function pickGroupStatus(rows: SlaAgreement[]): SlaStatus {
  if (rows.some((r) => r.status === "active")) return "active";
  if (rows.some((r) => r.status === "upcoming")) return "upcoming";
  if (rows.some((r) => r.status === "paused")) return "paused";
  return "ended";
}

function pickGroupFrequency(rows: SlaAgreement[]): SlaBillingFrequency {
  return rows.some((r) => r.billing_frequency === "quarterly")
    ? "quarterly"
    : "monthly";
}

function earliestStart(rows: SlaAgreement[]): string | null {
  const dates = rows
    .map((r) => r.start_date)
    .filter((d): d is string => !!d)
    .sort();
  return dates[0] ?? null;
}

function mergePeriods(rows: SlaAgreement[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    for (const p of normalizeInvoicedPeriods(row.invoiced_periods)) set.add(p);
  }
  return [...set].sort();
}

function buildGroups(items: SlaAgreement[]): ClientGroup[] {
  const map = new Map<string, SlaAgreement[]>();
  for (const row of items) {
    const key = row.client_name.trim().toLowerCase();
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }

  const groups: ClientGroup[] = [];
  for (const [, rows] of map) {
    const sorted = [...rows].sort((a, b) =>
      (a.domain ?? "").localeCompare(b.domain ?? ""),
    );
    const billable = sorted.filter(
      (r) => r.status === "active" && (Number(r.monthly_amount) || 0) > 0,
    );
    const frequency = pickGroupFrequency(sorted);
    const invoiced_periods = mergePeriods(sorted);
    const open_periods = [
      ...new Set(sorted.flatMap((r) => r.open_periods ?? [])),
    ].sort();
    const periodRow =
      billable[0] ?? sorted.find((r) => r.status === "active") ?? sorted[0];
    groups.push({
      key: sorted[0].client_name.trim().toLowerCase(),
      client_name: sorted[0].client_name,
      rows: sorted,
      status: pickGroupStatus(sorted),
      billing_frequency: frequency,
      monthly_total: sorted
        .filter((r) => r.status === "active" || r.status === "upcoming")
        .reduce((sum, r) => sum + (Number(r.monthly_amount) || 0), 0),
      invoice_via: sorted.find((r) => r.invoice_via)?.invoice_via ?? null,
      notes: sorted.find((r) => r.notes)?.notes ?? null,
      start_date: earliestStart(sorted),
      invoiced_periods,
      open_periods,
      current_period: periodRow.current_period,
      billable,
    });
  }

  const rank = (s: SlaStatus) =>
    s === "active" ? 0 : s === "upcoming" ? 1 : s === "paused" ? 2 : 3;

  return groups.sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      a.client_name.localeCompare(b.client_name),
  );
}

function PeriodChips({
  group,
  year,
  disabled,
  onToggle,
}: {
  group: ClientGroup;
  year: number;
  disabled?: boolean;
  onToggle: (period: string) => void;
}) {
  const periods = buildSlaYearPeriods(
    year,
    group.billing_frequency,
    group.start_date,
  );
  const checked = new Set(group.invoiced_periods);

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5",
        group.billing_frequency === "quarterly" ? "max-w-[280px]" : "max-w-full",
      )}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {periods.map((p) => {
        const isOn = checked.has(p.key);
        const canToggle = !disabled && p.available;
        return (
          <button
            key={p.key}
            type="button"
            disabled={!canToggle}
            onClick={() => canToggle && onToggle(p.key)}
            title={
              !p.available
                ? "Voor startdatum SLA"
                : `${formatSlaPeriodLabel(p.key)}${isOn ? " · gefactureerd" : " · open"}`
            }
            className={cn(
              "min-w-[2.4rem] px-1.5 py-1 rounded text-[11px] font-medium border transition-colors",
              !p.available &&
                "border-transparent text-neutral-700 bg-transparent cursor-default",
              p.available &&
                isOn &&
                "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
              p.available &&
                !isOn &&
                !p.future &&
                "border-neutral-700 bg-neutral-950/50 text-neutral-300 hover:border-neutral-500",
              p.available &&
                !isOn &&
                p.future &&
                "border-neutral-800 bg-neutral-900/30 text-neutral-600 hover:border-neutral-600 hover:text-neutral-400",
              !canToggle && p.available && "opacity-50 cursor-not-allowed",
            )}
          >
            <span className="inline-flex items-center justify-center gap-0.5">
              {isOn && <Check className="w-2.5 h-2.5" />}
              {p.label.replace(/\.$/, "")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SlaForm({
  open,
  onClose,
  onSave,
  initial,
  defaultClient,
}: {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  initial?: SlaAgreement | null;
  defaultClient?: string;
}) {
  const [form, setForm] = useState<FormState>(blankForm);
  const [loading, setLoading] = useState(false);
  const withUndo = useUndoToast();

  useEffect(() => {
    if (!open) return;
    setForm(
      initial
        ? {
            client_name: initial.client_name,
            domain: initial.domain ?? "",
            monthly_amount: String(initial.monthly_amount ?? ""),
            billing_frequency: initial.billing_frequency,
            invoice_via: initial.invoice_via ?? "",
            status: initial.status,
            notes: initial.notes ?? "",
            start_date: toDateInputValue(initial.start_date) || "",
          }
        : {
            ...blankForm,
            client_name: defaultClient ?? "",
          },
    );
  }, [open, initial, defaultClient]);

  const s = (k: keyof FormState, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        client_name: form.client_name.trim(),
        domain: form.domain.trim() || null,
        monthly_amount: parseFloat(form.monthly_amount) || 0,
        billing_frequency: form.billing_frequency,
        invoice_via: form.invoice_via.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
        start_date: form.start_date || null,
      };

      if (initial) {
        const snapshot = { ...initial };
        await withUndo({
          label: "SLA bijgewerkt",
          run: async () => {
            await updateSlaAgreement(initial.id, payload);
            onSave();
            onClose();
          },
          undo: async () => {
            await updateSlaAgreement(initial.id, {
              client_name: snapshot.client_name,
              domain: snapshot.domain,
              monthly_amount: snapshot.monthly_amount,
              billing_frequency: snapshot.billing_frequency,
              invoice_via: snapshot.invoice_via,
              status: snapshot.status,
              notes: snapshot.notes,
              start_date: snapshot.start_date,
              invoiced_periods: snapshot.invoiced_periods,
            });
            onSave();
          },
        });
        return;
      }

      await createSlaAgreement(payload);
      onSave();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "SLA bewerken" : "Nieuwe SLA"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sla-client">Klant</Label>
            <Input
              id="sla-client"
              value={form.client_name}
              onChange={(e) => s("client_name", e.target.value)}
              required
              placeholder="bijv. Solero"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sla-domain">Domein</Label>
            <Input
              id="sla-domain"
              value={form.domain}
              onChange={(e) => s("domain", e.target.value)}
              placeholder="voorbeeld.nl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sla-amount">Bedrag / maand</Label>
              <Input
                id="sla-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.monthly_amount}
                onChange={(e) => s("monthly_amount", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Facturatie</Label>
              <Select
                value={form.billing_frequency}
                onValueChange={(v) =>
                  s("billing_frequency", (v ?? "monthly") as SlaBillingFrequency)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Maandelijks</SelectItem>
                  <SelectItem value="quarterly">Per kwartaal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Startdatum SLA</Label>
            <DatePicker
              value={form.start_date || undefined}
              onChange={(v) => s("start_date", v || "")}
            />
            <p className="text-[11px] text-neutral-600">
              Maanden/kwartalen tellen vanaf deze datum.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => s("status", (v ?? "active") as SlaStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as SlaStatus[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {STATUS_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sla-via">Factuur via</Label>
              <Input
                id="sla-via"
                value={form.invoice_via}
                onChange={(e) => s("invoice_via", e.target.value)}
                placeholder="optioneel"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sla-notes">Notities</Label>
            <Input
              id="sla-notes"
              value={form.notes}
              onChange={(e) => s("notes", e.target.value)}
              placeholder="bijv. kwartaal via jWeb"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuleren
            </Button>
            <Button
              type="submit"
              disabled={loading || !form.client_name.trim()}
              className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950"
            >
              {loading ? "Opslaan…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClientGroupDialog({
  open,
  group,
  onClose,
  onSave,
  onEditDomain,
  onAddDomain,
  onDeleteDomain,
}: {
  open: boolean;
  group: ClientGroup | null;
  onClose: () => void;
  onSave: () => void;
  onEditDomain: (row: SlaAgreement) => void;
  onAddDomain: (clientName: string) => void;
  onDeleteDomain: (row: SlaAgreement) => void;
}) {
  const [clientName, setClientName] = useState("");
  const [frequency, setFrequency] = useState<SlaBillingFrequency>("monthly");
  const [invoiceVia, setInvoiceVia] = useState("");
  const [status, setStatus] = useState<SlaStatus>("active");
  const [notes, setNotes] = useState("");
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const withUndo = useUndoToast();

  useEffect(() => {
    if (!open || !group) return;
    setClientName(group.client_name);
    setFrequency(group.billing_frequency);
    setInvoiceVia(group.invoice_via ?? "");
    setStatus(group.status);
    setNotes(group.notes ?? "");
    setStartDate(toDateInputValue(group.start_date) || "");
  }, [open, group]);

  if (!group) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!group) return;
    setLoading(true);
    const snapshots = group.rows.map((r) => ({ ...r }));
    try {
      await withUndo({
        label: "Klant bijgewerkt",
        run: async () => {
          await Promise.all(
            group.rows.map((row) =>
              updateSlaAgreement(row.id, {
                client_name: clientName.trim(),
                billing_frequency: frequency,
                invoice_via: invoiceVia.trim() || null,
                status,
                notes: notes.trim() || null,
                start_date: startDate || null,
              }),
            ),
          );
          onSave();
          onClose();
        },
        undo: async () => {
          await Promise.all(
            snapshots.map((row) =>
              updateSlaAgreement(row.id, {
                client_name: row.client_name,
                billing_frequency: row.billing_frequency,
                invoice_via: row.invoice_via,
                status: row.status,
                notes: row.notes,
                start_date: row.start_date,
              }),
            ),
          );
          onSave();
        },
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group.client_name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label>Klantnaam</Label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Facturatie</Label>
              <Select
                value={frequency}
                onValueChange={(v) =>
                  setFrequency((v ?? "monthly") as SlaBillingFrequency)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Maandelijks</SelectItem>
                  <SelectItem value="quarterly">Per kwartaal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus((v ?? "active") as SlaStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as SlaStatus[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {STATUS_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Startdatum SLA</Label>
            <DatePicker
              value={startDate || undefined}
              onChange={(v) => setStartDate(v || "")}
            />
          </div>
          <div className="space-y-2">
            <Label>Factuur via</Label>
            <Input
              value={invoiceVia}
              onChange={(e) => setInvoiceVia(e.target.value)}
              placeholder="optioneel"
            />
          </div>
          <div className="space-y-2">
            <Label>Notities</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="optioneel"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Domeinen</Label>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAddDomain(clientName.trim() || group.client_name);
                }}
                className="text-xs text-[#d4e052] hover:underline"
              >
                + Domein
              </button>
            </div>
            <ul className="border border-neutral-800 rounded-lg divide-y divide-neutral-800">
              {group.rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm"
                >
                  <button
                    type="button"
                    className="flex-1 text-left min-w-0 hover:text-neutral-100 text-neutral-300"
                    onClick={() => {
                      onClose();
                      onEditDomain(row);
                    }}
                  >
                    <span className="truncate block">
                      {row.domain ? formatDomain(row.domain) : "Geen domein"}
                    </span>
                  </button>
                  <span className="font-mono text-xs text-neutral-500 shrink-0">
                    {formatCurrency(Number(row.monthly_amount) || 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onDeleteDomain(row)}
                    className="p-1 text-neutral-700 hover:text-red-400"
                    title="Verwijderen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuleren
            </Button>
            <Button
              type="submit"
              disabled={loading || !clientName.trim()}
              className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950"
            >
              {loading ? "Opslaan…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SlaPage() {
  const {
    data: items = [],
    isLoading,
    mutate,
  } = useSlaAgreements();
  const loading = isLoading && items.length === 0;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SlaAgreement | null>(null);
  const [defaultClient, setDefaultClient] = useState<string | undefined>();
  const [groupEdit, setGroupEdit] = useState<ClientGroup | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const withUndo = useUndoToast();

  const groups = useMemo(() => buildGroups(items), [items]);
  const activeGroups = useMemo(
    () => groups.filter((g) => g.status === "active"),
    [groups],
  );
  const upcomingGroups = useMemo(
    () => groups.filter((g) => g.status === "upcoming"),
    [groups],
  );
  const otherGroups = useMemo(
    () =>
      groups.filter((g) => g.status !== "active" && g.status !== "upcoming"),
    [groups],
  );

  const mrr = useMemo(
    () => activeGroups.reduce((sum, g) => sum + g.monthly_total, 0),
    [activeGroups],
  );
  const upcomingMrr = useMemo(
    () => upcomingGroups.reduce((sum, g) => sum + g.monthly_total, 0),
    [upcomingGroups],
  );
  const openGroups = useMemo(
    () => activeGroups.filter((g) => g.open_periods.length > 0),
    [activeGroups],
  );
  const openPeriodCount = useMemo(
    () => openGroups.reduce((sum, g) => sum + g.open_periods.length, 0),
    [openGroups],
  );

  async function toggleGroupPeriod(group: ClientGroup, period: string) {
    if (group.billable.length === 0 && group.rows.length === 0) return;
    const targets = group.billable.length > 0 ? group.billable : group.rows;
    const nextPeriods = toggleSlaPeriod(group.invoiced_periods, period);
    const snapshots = targets.map((r) => ({
      id: r.id,
      invoiced_periods: normalizeInvoicedPeriods(r.invoiced_periods),
    }));

    await withUndo({
      label: nextPeriods.includes(period)
        ? `${formatSlaPeriodLabel(period)} afgevinkt`
        : `${formatSlaPeriodLabel(period)} opengezet`,
      run: async () => {
        await Promise.all(
          targets.map((row) =>
            updateSlaAgreement(row.id, { invoiced_periods: nextPeriods }),
          ),
        );
        void mutate();
      },
      undo: async () => {
        await Promise.all(
          snapshots.map((row) =>
            updateSlaAgreement(row.id, {
              invoiced_periods: row.invoiced_periods,
            }),
          ),
        );
        void mutate();
      },
    });
  }

  async function handleDelete(row: SlaAgreement) {
    await withUndo({
      label: "SLA verwijderd",
      run: async () => {
        await deleteSlaAgreement(row.id);
        void mutate();
        setGroupEdit((current) => {
          if (!current) return null;
          const nextRows = current.rows.filter((r) => r.id !== row.id);
          if (nextRows.length === 0) return null;
          return buildGroups(nextRows)[0] ?? null;
        });
      },
      undo: async () => {
        await createSlaAgreement({
          client_name: row.client_name,
          company_id: row.company_id,
          domain: row.domain,
          monthly_amount: row.monthly_amount,
          billing_frequency: row.billing_frequency,
          invoice_via: row.invoice_via,
          status: row.status,
          notes: row.notes,
          start_date: row.start_date,
          invoiced_periods: row.invoiced_periods,
        });
        void mutate();
      },
    });
  }

  function openGroup(group: ClientGroup) {
    if (group.rows.length === 1) {
      setEditing(group.rows[0]);
      setDefaultClient(undefined);
      setFormOpen(true);
      return;
    }
    setGroupEdit(group);
  }

  function renderGroup(group: ClientGroup) {
    const invoiceAmt = slaInvoiceAmount(
      group.monthly_total,
      group.billing_frequency,
    );
    const canInvoice = group.status === "active" && !!group.start_date;

    return (
      <div
        key={group.key}
        role="button"
        tabIndex={0}
        onClick={() => openGroup(group)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openGroup(group);
          }
        }}
        className={cn(
          "px-4 py-3.5 border-b border-neutral-800/80 cursor-pointer transition-colors",
          "hover:bg-neutral-900/50 focus-visible:outline-none focus-visible:bg-neutral-900/50",
          group.status === "upcoming" && "opacity-80",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-neutral-100">
                {group.client_name}
              </p>
              {group.status !== "active" && (
                <span
                  className={cn(
                    "text-[11px] px-1.5 py-0.5 rounded",
                    group.status === "upcoming" &&
                      "bg-blue-500/10 text-blue-300",
                    group.status === "paused" &&
                      "bg-neutral-800 text-neutral-400",
                    group.status === "ended" &&
                      "bg-neutral-900 text-neutral-600",
                  )}
                >
                  {STATUS_LABELS[group.status]}
                </span>
              )}
              <span className="text-[11px] text-neutral-600">
                {group.billing_frequency === "quarterly"
                  ? "Per kwartaal"
                  : "Per maand"}
              </span>
              {group.start_date && (
                <span className="text-[11px] text-neutral-600">
                  vanaf {group.start_date}
                </span>
              )}
              {group.invoice_via && (
                <span className="text-[11px] text-neutral-500">
                  via {group.invoice_via}
                </span>
              )}
            </div>

            {group.rows.some((r) => r.domain) ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {group.rows.map((row) =>
                  row.domain ? (
                    <a
                      key={row.id}
                      href={domainHref(row.domain)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-neutral-500 hover:text-neutral-300 inline-flex items-center gap-1"
                    >
                      {formatDomain(row.domain)}
                      <span className="font-mono text-neutral-600">
                        {formatCurrency(Number(row.monthly_amount) || 0)}
                      </span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-40" />
                    </a>
                  ) : null,
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-600">Geen domein</p>
            )}

            {group.notes && (
              <p className="text-[11px] text-neutral-600">{group.notes}</p>
            )}
          </div>

          <div className="text-right shrink-0 pt-0.5">
            <p className="text-sm font-mono text-neutral-200">
              {formatCurrency(group.monthly_total)}
              <span className="text-neutral-600 text-xs">/mnd</span>
            </p>
            {group.billing_frequency === "quarterly" && (
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {formatCurrency(invoiceAmt)}/kw
              </p>
            )}
            {group.open_periods.length > 0 && (
              <p className="text-[11px] text-amber-400/80 mt-1">
                {group.open_periods.length} open
              </p>
            )}
          </div>
        </div>

        {group.status === "active" && (
          <div className="mt-3">
            {!group.start_date ? (
              <p className="text-xs text-neutral-600">
                Zet een startdatum om periodes af te vinken.
              </p>
            ) : (
              <PeriodChips
                group={group}
                year={year}
                disabled={!canInvoice}
                onToggle={(period) => void toggleGroupPeriod(group, period)}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-neutral-100">
            SLA&apos;s
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Per klant · afvinken per maand of kwartaal vanaf startdatum
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex items-center gap-1 border border-neutral-800 rounded-lg bg-neutral-900/40 px-1">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="p-2 text-neutral-500 hover:text-neutral-200"
              aria-label="Vorig jaar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-mono text-neutral-200 w-12 text-center">
              {year}
            </span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              className="p-2 text-neutral-500 hover:text-neutral-200"
              aria-label="Volgend jaar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setDefaultClient(undefined);
              setFormOpen(true);
            }}
            className="w-full sm:w-auto bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium gap-2"
          >
            <Plus className="w-4 h-4" /> Nieuwe SLA
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Actieve MRR</p>
          <p className="text-lg font-mono text-[#d4e052] font-medium">
            {formatCurrency(mrr)}
          </p>
          <p className="text-[11px] text-neutral-600 mt-0.5">
            {activeGroups.length} klanten
          </p>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Pipeline (komt eraan)</p>
          <p className="text-lg font-mono text-blue-300 font-medium">
            {formatCurrency(upcomingMrr)}
          </p>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Nog open</p>
          <p className="text-lg font-mono text-neutral-200 font-medium">
            {openPeriodCount}
          </p>
          <p className="text-[11px] text-neutral-600 mt-0.5">
            {openPeriodCount === 0
              ? "Alles bij · vanaf start t/m nu"
              : `${openGroups.length} klanten · mag opsparen`}
          </p>
        </div>
      </div>

      {openGroups.length > 0 && (
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-sm text-neutral-200 font-medium mb-1">Openstaand</p>
          <p className="text-xs text-neutral-500 mb-3">
            Periodes vanaf startdatum die nog niet zijn afgevinkt.
          </p>
          <ul className="space-y-2">
            {openGroups.map((g) => (
              <li
                key={g.key}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <button
                  type="button"
                  className="text-neutral-300 hover:text-neutral-100 text-left min-w-0"
                  onClick={() => openGroup(g)}
                >
                  <span className="block truncate">{g.client_name}</span>
                  <span className="text-[11px] text-neutral-600">
                    {g.open_periods
                      .slice(0, 6)
                      .map((p) => formatSlaPeriodLabel(p, true))
                      .join(" · ")}
                    {g.open_periods.length > 6
                      ? ` +${g.open_periods.length - 6}`
                      : ""}
                  </span>
                </button>
                <span className="font-mono text-xs text-neutral-500 shrink-0">
                  {g.open_periods.length} open
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="border border-neutral-800 rounded-lg h-64 animate-pulse" />
      ) : groups.length === 0 ? (
        <div className="py-20 text-center border border-neutral-800 rounded-lg">
          <Shield className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-600 text-sm">Nog geen SLA&apos;s</p>
        </div>
      ) : (
        <div className="border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/50 text-xs text-neutral-500 flex justify-between gap-3">
            <span>Klant · periodes {year}</span>
            <span>Bedrag</span>
          </div>
          {activeGroups.map(renderGroup)}
          {upcomingGroups.length > 0 && (
            <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-neutral-600 bg-neutral-950/50 border-b border-neutral-800">
              Komt eraan
            </div>
          )}
          {upcomingGroups.map(renderGroup)}
          {otherGroups.map(renderGroup)}
        </div>
      )}

      <SlaForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setDefaultClient(undefined);
        }}
        onSave={() => void mutate()}
        initial={editing}
        defaultClient={defaultClient}
      />

      <ClientGroupDialog
        open={!!groupEdit}
        group={
          groupEdit
            ? groups.find((g) => g.key === groupEdit.key) ?? groupEdit
            : null
        }
        onClose={() => setGroupEdit(null)}
        onSave={() => void mutate()}
        onEditDomain={(row) => {
          setEditing(row);
          setDefaultClient(undefined);
          setFormOpen(true);
        }}
        onAddDomain={(clientName) => {
          setEditing(null);
          setDefaultClient(clientName);
          setFormOpen(true);
        }}
        onDeleteDomain={(row) => void handleDelete(row)}
      />
    </div>
  );
}

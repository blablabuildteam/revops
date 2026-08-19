"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState, useEffect } from "react";
import {
  Plus,
  Shield,
  ExternalLink,
  Trash2,
  Check,
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
import { formatCurrency } from "@/lib/format";
import {
  formatSlaPeriodLabel,
  slaInvoiceAmount,
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
};

const blankForm: FormState = {
  client_name: "",
  domain: "",
  monthly_amount: "",
  billing_frequency: "monthly",
  invoice_via: "",
  status: "active",
  notes: "",
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
  invoiced: boolean;
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
      invoiced: billable.length > 0 && billable.every((r) => r.invoiced),
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
              invoiced: snapshot.invoiced,
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

/** Edit shared client fields + pick a domain line to tweak/delete. */
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
  const [loading, setLoading] = useState(false);
  const withUndo = useUndoToast();

  useEffect(() => {
    if (!open || !group) return;
    setClientName(group.client_name);
    setFrequency(group.billing_frequency);
    setInvoiceVia(group.invoice_via ?? "");
    setStatus(group.status);
    setNotes(group.notes ?? "");
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

function InvoiceCheck({
  checked,
  periodLabel,
  frequency,
  disabled,
  onToggle,
}: {
  checked: boolean;
  periodLabel: string;
  frequency: SlaBillingFrequency;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "inline-flex items-center gap-2 text-left rounded-md border px-2.5 py-1.5 transition-colors shrink-0",
        disabled && "opacity-40 cursor-not-allowed",
        checked
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-neutral-700 bg-neutral-950/40 text-neutral-300 hover:border-neutral-500",
      )}
      title={
        checked
          ? `Gefactureerd · ${periodLabel}`
          : `Afvinken wanneer ${frequency === "quarterly" ? "dit kwartaal" : "deze maand"} gefactureerd is`
      }
    >
      <span
        className={cn(
          "w-4 h-4 rounded border flex items-center justify-center shrink-0",
          checked
            ? "border-emerald-400 bg-emerald-500/20"
            : "border-neutral-500",
        )}
      >
        {checked && <Check className="w-3 h-3" />}
      </span>
      <span className="leading-tight">
        <span className="block text-xs font-medium">
          {frequency === "quarterly" ? "Kwartaal" : "Maand"}
        </span>
        <span className="block text-[11px] opacity-70">{periodLabel}</span>
      </span>
    </button>
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
    () => activeGroups.filter((g) => g.billable.length > 0 && !g.invoiced),
    [activeGroups],
  );

  async function toggleGroupInvoiced(group: ClientGroup) {
    if (group.billable.length === 0) return;
    const next = !group.invoiced;
    const snapshots = group.billable.map((r) => ({
      id: r.id,
      invoiced: r.invoiced,
    }));
    await withUndo({
      label: next ? "Gemarkeerd als gefactureerd" : "Factuurstatus teruggezet",
      run: async () => {
        await Promise.all(
          group.billable.map((row) =>
            updateSlaAgreement(row.id, { invoiced: next }),
          ),
        );
        void mutate();
      },
      undo: async () => {
        await Promise.all(
          snapshots.map((row) =>
            updateSlaAgreement(row.id, { invoiced: row.invoiced }),
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
          invoiced: row.invoiced,
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
    const periodLabel = formatSlaPeriodLabel(group.current_period);
    const domains = group.rows
      .map((r) => (r.domain ? formatDomain(r.domain) : null))
      .filter(Boolean) as string[];

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
          "flex items-start gap-3 px-4 py-3.5 border-b border-neutral-800/80 cursor-pointer transition-colors",
          "hover:bg-neutral-900/50 focus-visible:outline-none focus-visible:bg-neutral-900/50",
          group.status === "upcoming" && "opacity-80",
        )}
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-neutral-100">
              {group.client_name}
            </p>
            {group.status !== "active" && (
              <span
                className={cn(
                  "text-[11px] px-1.5 py-0.5 rounded",
                  group.status === "upcoming" && "bg-blue-500/10 text-blue-300",
                  group.status === "paused" && "bg-neutral-800 text-neutral-400",
                  group.status === "ended" && "bg-neutral-900 text-neutral-600",
                )}
              >
                {STATUS_LABELS[group.status]}
              </span>
            )}
            {group.invoice_via && (
              <span className="text-[11px] text-neutral-500">
                via {group.invoice_via}
              </span>
            )}
          </div>

          {domains.length > 0 ? (
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
        </div>

        <InvoiceCheck
          checked={group.invoiced}
          periodLabel={periodLabel}
          frequency={group.billing_frequency}
          disabled={group.status !== "active" || group.billable.length === 0}
          onToggle={() => void toggleGroupInvoiced(group)}
        />
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
            Per klant · klik om te wijzigen · vink maand/kwartaal af
          </p>
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
            {openGroups.length}
          </p>
          <p className="text-[11px] text-neutral-600 mt-0.5">
            {openGroups.length === 0
              ? "Alles afgevinkt"
              : "Klanten nog niet gefactureerd"}
          </p>
        </div>
      </div>

      {openGroups.length > 0 && (
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-sm text-neutral-200 font-medium mb-1">Openstaand</p>
          <p className="text-xs text-neutral-500 mb-3">
            Nog niet afgevinkt — mag opsparen.
          </p>
          <ul className="space-y-2">
            {openGroups.map((g) => (
              <li
                key={g.key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <button
                  type="button"
                  className="text-neutral-300 hover:text-neutral-100 text-left truncate"
                  onClick={() => openGroup(g)}
                >
                  {g.client_name}
                  <span className="text-neutral-600 text-xs ml-2">
                    {g.billing_frequency === "quarterly" ? "kwartaal" : "maand"}
                  </span>
                </button>
                <span className="font-mono text-xs text-neutral-500 shrink-0">
                  {formatCurrency(g.monthly_total)}/mnd
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
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/50 text-xs text-neutral-500">
            <span>Klant</span>
            <span className="text-right w-24">Bedrag</span>
            <span className="w-[7.5rem]">Gefactureerd</span>
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

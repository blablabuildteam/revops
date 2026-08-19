"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState, useEffect } from "react";
import {
  Plus,
  Shield,
  ExternalLink,
  Settings2,
  Trash2,
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

const FREQ_LABELS: Record<SlaBillingFrequency, string> = {
  monthly: "Maandelijks",
  quarterly: "Per kwartaal",
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

function domainHref(domain: string) {
  if (/^https?:\/\//i.test(domain)) return domain;
  return `https://${domain}`;
}

function SlaForm({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  initial?: SlaAgreement | null;
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
        : blankForm,
    );
  }, [open, initial]);

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

export default function SlaPage() {
  const {
    data: items = [],
    isLoading,
    mutate,
  } = useSlaAgreements();
  const loading = isLoading && items.length === 0;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SlaAgreement | null>(null);
  const withUndo = useUndoToast();

  const active = useMemo(
    () => items.filter((s) => s.status === "active"),
    [items],
  );
  const upcoming = useMemo(
    () => items.filter((s) => s.status === "upcoming"),
    [items],
  );

  const mrr = useMemo(
    () => active.reduce((sum, s) => sum + (Number(s.monthly_amount) || 0), 0),
    [active],
  );
  const upcomingMrr = useMemo(
    () => upcoming.reduce((sum, s) => sum + (Number(s.monthly_amount) || 0), 0),
    [upcoming],
  );
  const openInvoice = useMemo(
    () =>
      active.filter((s) => !s.invoiced && (Number(s.monthly_amount) || 0) > 0),
    [active],
  );
  const openInvoiceTotal = useMemo(
    () =>
      openInvoice.reduce(
        (sum, s) =>
          sum + slaInvoiceAmount(Number(s.monthly_amount) || 0, s.billing_frequency),
        0,
      ),
    [openInvoice],
  );

  async function toggleInvoiced(row: SlaAgreement) {
    const next = !row.invoiced;
    await withUndo({
      label: next ? "Gemarkeerd als gefactureerd" : "Factuurstatus teruggezet",
      run: async () => {
        await updateSlaAgreement(row.id, { invoiced: next });
        void mutate();
      },
      undo: async () => {
        await updateSlaAgreement(row.id, { invoiced: row.invoiced });
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

  function renderRow(row: SlaAgreement) {
    const invoiceAmt = slaInvoiceAmount(
      Number(row.monthly_amount) || 0,
      row.billing_frequency,
    );
    return (
      <tr
        key={row.id}
        className="border-b border-neutral-800/80 hover:bg-neutral-900/40"
      >
        <td className="px-4 py-3 align-top">
          <p className="text-sm font-medium text-neutral-200">{row.client_name}</p>
          {row.invoice_via && (
            <p className="text-[11px] text-neutral-500 mt-0.5">
              via {row.invoice_via}
            </p>
          )}
          {row.notes && (
            <p className="text-[11px] text-neutral-600 mt-0.5 max-w-[220px]">
              {row.notes}
            </p>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          {row.domain ? (
            <a
              href={domainHref(row.domain)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-neutral-400 hover:text-neutral-200 inline-flex items-center gap-1"
            >
              {row.domain.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
              <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
          ) : (
            <span className="text-sm text-neutral-700">—</span>
          )}
        </td>
        <td className="px-4 py-3 align-top text-right">
          <p className="text-sm font-mono text-neutral-200">
            {formatCurrency(Number(row.monthly_amount) || 0)}
          </p>
          {row.billing_frequency === "quarterly" && (
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {formatCurrency(invoiceAmt)} / kwartaal
            </p>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded",
              row.billing_frequency === "quarterly"
                ? "bg-amber-500/10 text-amber-300"
                : "bg-neutral-800 text-neutral-400",
            )}
          >
            {FREQ_LABELS[row.billing_frequency]}
          </span>
        </td>
        <td className="px-4 py-3 align-top">
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded",
              row.status === "active" && "bg-[#d4e052]/10 text-[#d4e052]",
              row.status === "upcoming" && "bg-blue-500/10 text-blue-300",
              row.status === "paused" && "bg-neutral-800 text-neutral-400",
              row.status === "ended" && "bg-neutral-900 text-neutral-600",
            )}
          >
            {STATUS_LABELS[row.status]}
          </span>
        </td>
        <td className="px-4 py-3 align-top">
          {row.status === "active" ? (
            <button
              type="button"
              onClick={() => void toggleInvoiced(row)}
              className={cn(
                "text-xs px-2.5 py-1 rounded border transition-colors",
                row.invoiced
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
              )}
              title={formatSlaPeriodLabel(row.current_period)}
            >
              {row.invoiced
                ? `✓ ${formatSlaPeriodLabel(row.current_period)}`
                : `Open · ${formatSlaPeriodLabel(row.current_period)}`}
            </button>
          ) : (
            <span className="text-xs text-neutral-700">—</span>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setEditing(row);
                setFormOpen(true);
              }}
              className="p-1.5 text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 rounded"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(row)}
              className="p-1.5 text-neutral-700 hover:text-red-400 hover:bg-neutral-800 rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
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
            Hosting &amp; infra · facturatiestatus per periode
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="w-full sm:w-auto bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium gap-2"
        >
          <Plus className="w-4 h-4" /> Nieuwe SLA
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Actieve MRR</p>
          <p className="text-lg font-mono text-[#d4e052] font-medium">
            {formatCurrency(mrr)}
          </p>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Nog te factureren</p>
          <p className="text-lg font-mono text-amber-300 font-medium">
            {formatCurrency(openInvoiceTotal)}
          </p>
          <p className="text-[11px] text-neutral-600 mt-0.5">
            {openInvoice.length} open deze periode
          </p>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Pipeline (komt eraan)</p>
          <p className="text-lg font-mono text-blue-300 font-medium">
            {formatCurrency(upcomingMrr)}
          </p>
          <p className="text-[11px] text-neutral-600 mt-0.5">
            Solero / Thuishaven e.d.
          </p>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Actieve regels</p>
          <p className="text-lg font-mono text-neutral-200 font-medium">
            {active.length}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="border border-neutral-800 rounded-lg h-64 animate-pulse" />
      ) : items.length === 0 ? (
        <div className="py-20 text-center border border-neutral-800 rounded-lg">
          <Shield className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-600 text-sm">Nog geen SLA&apos;s</p>
        </div>
      ) : (
        <div className="border border-neutral-800 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/50">
                <th className="px-4 py-3 text-xs font-medium text-neutral-500">
                  Klant
                </th>
                <th className="px-4 py-3 text-xs font-medium text-neutral-500">
                  Domein
                </th>
                <th className="px-4 py-3 text-xs font-medium text-neutral-500 text-right">
                  / maand
                </th>
                <th className="px-4 py-3 text-xs font-medium text-neutral-500">
                  Facturatie
                </th>
                <th className="px-4 py-3 text-xs font-medium text-neutral-500">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-medium text-neutral-500">
                  Gefactureerd
                </th>
                <th className="px-4 py-3 text-xs font-medium text-neutral-500" />
              </tr>
            </thead>
            <tbody>
              {active.map(renderRow)}
              {upcoming.length > 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-2 text-[11px] uppercase tracking-wide text-neutral-600 bg-neutral-950/40"
                  >
                    Komt eraan
                  </td>
                </tr>
              )}
              {upcoming.map(renderRow)}
              {items
                .filter((s) => s.status !== "active" && s.status !== "upcoming")
                .map(renderRow)}
            </tbody>
          </table>
        </div>
      )}

      <SlaForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={() => void mutate()}
        initial={editing}
      />
    </div>
  );
}

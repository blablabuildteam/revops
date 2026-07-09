"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Company,
  NewOpportunity,
  Opportunity,
  STAGE_LABELS,
  TYPE_LABELS,
} from "@/lib/types";
import { createOpportunity, updateOpportunity, getCompanies, createCompany } from "@/lib/api";

interface OpportunityFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (opp: Opportunity) => void;
  initial?: Opportunity | null;
}

const defaultForm: NewOpportunity = {
  name: "",
  company_id: undefined,
  description: "",
  type: "new_business",
  stage: "prospect",
  probability: 25,
  expected_value: 0,
  actual_value: 0,
  currency: "EUR",
  sentiment: "neutral",
  proposal_status: "not_sent",
  proposal_url: "",
  owner: "",
  close_date: "",
  notes: "",
  tags: [],
};

const fieldClass =
  "bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600";

export function OpportunityForm({
  open,
  onClose,
  onSave,
  initial,
}: OpportunityFormProps) {
  const [form, setForm] = useState<NewOpportunity>(defaultForm);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [addingCompany, setAddingCompany] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCompanies().then(setCompanies);
  }, []);

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name,
        company_id: initial.company_id,
        description: initial.description || "",
        type: initial.type,
        stage: initial.stage,
        probability: initial.probability,
        expected_value: initial.expected_value,
        actual_value: initial.actual_value,
        currency: initial.currency,
        sentiment: initial.sentiment,
        proposal_status: initial.proposal_status,
        proposal_url: initial.proposal_url || "",
        owner: initial.owner || "",
        close_date: initial.close_date || "",
        notes: initial.notes || "",
        tags: initial.tags || [],
      });
    } else {
      setForm(defaultForm);
    }
  }, [initial, open]);

  const set = (key: keyof NewOpportunity, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleAddCompany() {
    if (!newCompanyName.trim()) return;
    setAddingCompany(true);
    try {
      const company = await createCompany({ name: newCompanyName.trim() });
      setCompanies((c) => [...c, company]);
      set("company_id", company.id);
      setNewCompanyName("");
    } finally {
      setAddingCompany(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        company_id: form.company_id || undefined,
        type: form.type,
        stage: form.stage,
        probability: Number(form.probability),
        expected_value: Number(form.expected_value),
        actual_value: Number(form.actual_value),
        currency: form.currency,
        owner: form.owner || undefined,
        notes: form.notes || undefined,
        ...(initial
          ? {}
          : {
              sentiment: form.sentiment,
              proposal_status: form.proposal_status,
            }),
      };
      const saved = initial
        ? await updateOpportunity(initial.id, payload)
        : await createOpportunity({ ...defaultForm, ...payload });
      onSave(saved);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Er is iets misgegaan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-4xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-neutral-100">
            {initial ? "Kans bewerken" : "Nieuwe kans toevoegen"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Basis
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3 space-y-1.5">
                <Label className="text-neutral-400 text-xs">Naam *</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="bijv. Website redesign Q3"
                  className={fieldClass}
                />
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-neutral-400 text-xs">Bedrijf</Label>
                <Select
                  value={form.company_id || "none"}
                  onValueChange={(v) => set("company_id", v === "none" ? undefined : v)}
                >
                  <SelectTrigger className={fieldClass}>
                    <SelectValue placeholder="Selecteer bedrijf" />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-800 border-neutral-700">
                    <SelectItem value="none" className="text-neutral-400">Geen bedrijf</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-neutral-100">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Nieuw bedrijf toevoegen..."
                    className={`${fieldClass} text-xs h-7`}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCompany())}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCompany}
                    disabled={addingCompany || !newCompanyName.trim()}
                    className="h-7 text-xs border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                  >
                    +
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger className={fieldClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-800 border-neutral-700">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-neutral-100">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Deal
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Fase</Label>
                <Select value={form.stage} onValueChange={(v) => set("stage", v)}>
                  <SelectTrigger className={fieldClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-800 border-neutral-700">
                    {Object.entries(STAGE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-neutral-100">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Deal Order (€)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.expected_value}
                  onChange={(e) => set("expected_value", e.target.value)}
                  className={`${fieldClass} font-mono`}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Gerealiseerd (€)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.actual_value}
                  onChange={(e) => set("actual_value", e.target.value)}
                  className={`${fieldClass} font-mono`}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Kans (%) — {form.probability}%</Label>
                <Input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={form.probability}
                  onChange={(e) => set("probability", e.target.value)}
                  className="h-2 bg-neutral-800 accent-[#e8ff47] mt-3"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Overig
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Verantwoordelijke</Label>
                <Input
                  value={form.owner || ""}
                  onChange={(e) => set("owner", e.target.value)}
                  placeholder="bijv. Kevin"
                  className={fieldClass}
                />
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-neutral-400 text-xs">Notities</Label>
                <Textarea
                  value={form.notes || ""}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Context, updates, volgende stappen..."
                  rows={3}
                  className={`${fieldClass} resize-none`}
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-950/50 px-3 py-2 rounded">{error}</p>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            >
              Annuleren
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium"
            >
              {loading ? "Opslaan..." : initial ? "Opslaan" : "Toevoegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

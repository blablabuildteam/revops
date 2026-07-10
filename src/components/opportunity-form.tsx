"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  normalizeOpportunityType,
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
  type: "new",
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

const fc = "bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600";

export function OpportunityForm({ open, onClose, onSave, initial }: OpportunityFormProps) {
  const [form, setForm] = useState<NewOpportunity>(defaultForm);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [addingCompany, setAddingCompany] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const resizeNotes = useCallback(() => {
    const el = notesRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => { getCompanies().then(setCompanies); }, []);

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name,
        company_id: initial.company_id,
        description: initial.description || "",
        type: normalizeOpportunityType(initial.type),
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
      if (initial.company?.id && initial.company?.name) {
        setCompanies((prev) =>
          prev.some((c) => c.id === initial.company!.id)
            ? prev
            : [...prev, initial.company as Company]
        );
      }
    } else {
      setForm(defaultForm);
    }
  }, [initial, open]);

  useEffect(() => {
    if (open) resizeNotes();
  }, [open, form.notes, resizeNotes]);

  const companyName = useMemo(() => {
    if (!form.company_id) return null;
    return companies.find((c) => c.id === form.company_id)?.name ?? initial?.company?.name ?? null;
  }, [form.company_id, companies, initial?.company?.name]);

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
        ...(initial ? {} : { sentiment: form.sentiment, proposal_status: form.proposal_status }),
      };
      const saved = initial
        ? await updateOpportunity(initial.id, payload)
        : await createOpportunity({ ...defaultForm, ...payload });
      onSave(saved);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 !max-w-5xl w-[92vw] p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-neutral-100 text-lg">
              {initial ? "Edit opportunity" : "Add new opportunity"}
            </DialogTitle>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-[3fr_2fr] gap-8 px-6 py-4">
            {/* LEFT COLUMN */}
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-neutral-400 text-xs">Name *</Label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Website redesign Q3"
                    className={`${fc} w-full`}
                  />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-neutral-400 text-xs">Company</Label>
                  <Select
                    value={form.company_id || "none"}
                    onValueChange={(v) => {
                      if (v === "__new__") return;
                      set("company_id", v === "none" ? undefined : v);
                    }}
                  >
                    <SelectTrigger className={`${fc} w-full`}>
                      <SelectValue>{companyName ?? "No company"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-800 border-neutral-700">
                      <SelectItem value="none" className="text-neutral-400">No company</SelectItem>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-neutral-100">{c.name}</SelectItem>
                      ))}
                      <div className="border-t border-neutral-700 mt-1 pt-1 px-1 pb-1">
                        <div
                          className="flex gap-1.5 items-center"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <input
                            value={newCompanyName}
                            onChange={(e) => setNewCompanyName(e.target.value)}
                            placeholder="New company..."
                            className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-neutral-500"
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") { e.preventDefault(); handleAddCompany(); }
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleAddCompany}
                            disabled={addingCompany || !newCompanyName.trim()}
                            className="shrink-0 h-6 w-6 rounded bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                          >+</button>
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-neutral-400 text-xs">Type</Label>
                  <Select value={form.type} onValueChange={(v) => set("type", v)}>
                    <SelectTrigger className={`${fc} w-full`}>
                      <SelectValue>{TYPE_LABELS[form.type]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-800 border-neutral-700">
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-neutral-100">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-neutral-400 text-xs">Stage</Label>
                  <Select value={form.stage} onValueChange={(v) => set("stage", v)}>
                    <SelectTrigger className={`${fc} w-full`}>
                      <SelectValue>{STAGE_LABELS[form.stage]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-800 border-neutral-700">
                      {Object.entries(STAGE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-neutral-100">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Deal Order + Realized */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Deal Order (€)</Label>
                  <Input
                    type="number" min="0"
                    value={form.expected_value}
                    onChange={(e) => set("expected_value", e.target.value)}
                    className={`${fc} font-mono`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Realized (€)</Label>
                  <Input
                    type="number" min="0"
                    value={form.actual_value}
                    onChange={(e) => set("actual_value", e.target.value)}
                    className={`${fc} font-mono`}
                  />
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-neutral-400 text-xs">Probability — {form.probability}%</Label>
                  <Input
                    type="range" min="0" max="100" step="5"
                    value={form.probability}
                    onChange={(e) => set("probability", e.target.value)}
                    className="h-2 bg-neutral-800 accent-[#e8ff47] mt-2 w-full"
                  />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-neutral-400 text-xs">Owner</Label>
                  <Input
                    value={form.owner || ""}
                    onChange={(e) => set("owner", e.target.value)}
                    placeholder="e.g. Kevin"
                    className={`${fc} w-full`}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Notes</Label>
                <Textarea
                  ref={notesRef}
                  value={form.notes || ""}
                  onChange={(e) => {
                    set("notes", e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  placeholder="Context, updates, next steps..."
                  rows={1}
                  className={`${fc} resize-none w-full min-h-10 overflow-hidden`}
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-950/50 px-6 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-800">
            <Button
              type="button" variant="ghost" onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              type="submit" disabled={loading}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium"
            >
              {loading ? "Saving..." : initial ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

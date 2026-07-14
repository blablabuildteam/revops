"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Plus, ExternalLink, Building2, Settings2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompanyAvatar } from "@/components/company-avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { StageBadge } from "@/components/stage-badge";
import { getCompanies, getOpportunities, createCompany } from "@/lib/api";
import { Company, Opportunity, RetainerType } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

const RETAINER_LABELS: Record<RetainerType, string> = {
  none: "No retainer",
  fixed: "Fixed retainer",
  commission: "Revenue commission",
};

type FormState = {
  name: string; industry: string; website: string; country: string;
  retainer_type: RetainerType; retainer_amount: string; commission_pct: string;
};

function CompanyForm({
  open, onClose, onSave, initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (c: Company) => void;
  initial?: Company | null;
}) {
  const blank: FormState = {
    name: "", industry: "", website: "", country: "NL",
    retainer_type: "none", retainer_amount: "", commission_pct: "",
  };
  const [form, setForm] = useState<FormState>(blank);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? {
        name: initial.name,
        industry: initial.industry ?? "",
        website: initial.website ?? "",
        country: initial.country ?? "NL",
        retainer_type: initial.retainer_type ?? "none",
        retainer_amount: String(initial.retainer_amount ?? ""),
        commission_pct: String(initial.commission_pct ?? ""),
      } : blank);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const s = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        industry: form.industry || null,
        website: form.website || null,
        country: form.country || "NL",
        retainer_type: form.retainer_type,
        retainer_amount: parseFloat(form.retainer_amount) || 0,
        commission_pct: parseFloat(form.commission_pct) || 0,
      };

      let company: Company;
      if (initial) {
        const res = await fetch(`/api/companies/${initial.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        company = await res.json();
      } else {
        company = await createCompany(payload);
      }
      onSave(company);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-neutral-100">
            {initial ? `Edit ${initial.name}` : "New company"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Name *</Label>
            <Input required value={form.name} onChange={(e) => s("name", e.target.value)}
              className="bg-neutral-800 border-neutral-700 text-neutral-100" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Industry</Label>
              <Input value={form.industry} onChange={(e) => s("industry", e.target.value)}
                placeholder="e.g. SaaS, Retail"
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Website</Label>
              <Input value={form.website} onChange={(e) => s("website", e.target.value)}
                placeholder="example.com"
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 font-mono text-xs" />
            </div>
          </div>

          {/* Retainer section */}
          <div className="pt-2 border-t border-neutral-800 space-y-3">
            <p className="text-xs text-neutral-500 uppercase tracking-widest">Billing model</p>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Type</Label>
              <Select value={form.retainer_type} onValueChange={(v) => s("retainer_type", v ?? "none")}>
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  <SelectItem value="none" className="text-neutral-400">No retainer</SelectItem>
                  <SelectItem value="fixed" className="text-neutral-100">Fixed monthly retainer</SelectItem>
                  <SelectItem value="commission" className="text-neutral-100">Revenue commission</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.retainer_type === "fixed" && (
              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Monthly amount (€)</Label>
                <Input type="number" value={form.retainer_amount} onChange={(e) => s("retainer_amount", e.target.value)}
                  placeholder="6050" min="0" step="100"
                  className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 font-mono" />
                <p className="text-[11px] text-neutral-600">Auto-filled on the finance page</p>
              </div>
            )}

            {form.retainer_type === "commission" && (
              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Commission percentage (%)</Label>
                <Input type="number" value={form.commission_pct} onChange={(e) => s("commission_pct", e.target.value)}
                  placeholder="15" min="0" max="100" step="0.5"
                  className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 font-mono" />
                <p className="text-[11px] text-neutral-600">Enter monthly client revenue — we calculate the fee automatically</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800">Cancel</Button>
            <Button type="submit" disabled={loading}
              className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium">
              {loading ? "Saving..." : initial ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const retainerBadge = (c: Company) => {
  if (c.retainer_type === "fixed")
    return <span className="text-xs text-emerald-400 flex items-center gap-1"><Repeat className="w-3 h-3" /> {formatCurrency(c.retainer_amount ?? 0)}/mo</span>;
  if (c.retainer_type === "commission")
    return <span className="text-xs text-blue-400 flex items-center gap-1"><Repeat className="w-3 h-3" /> {c.commission_pct}% commission</span>;
  return null;
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);

  useEffect(() => {
    Promise.all([getCompanies(), getOpportunities()]).then(([c, o]) => {
      setCompanies(c);
      setOpps(o);
      setLoading(false);
    });
  }, []);

  const companyOpps = (id: string) => opps.filter((o) => o.company_id === id);
  const companyRevenue = (id: string) => companyOpps(id).reduce((s, o) => s + o.actual_value, 0);
  const companyPipeline = (id: string) =>
    companyOpps(id).filter((o) => !["won", "lost"].includes(o.stage)).reduce((s, o) => s + o.expected_value, 0);

  function handleSave(updated: Company) {
    setCompanies((prev) =>
      prev.some((c) => c.id === updated.id)
        ? prev.map((c) => (c.id === updated.id ? updated : c))
        : [...prev, updated]
    );
    setEditing(null);
  }

  function handleLogoChange(companyId: string, logoUrl: string) {
    setCompanies((prev) =>
      prev.map((c) => (c.id === companyId ? { ...c, logo_url: logoUrl } : c))
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Companies</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{companies.length} companies</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}
          className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2">
          <Plus className="w-4 h-4" /> New company
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="border border-neutral-800 rounded-lg h-32 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {companies.map((company) => {
            const revenue = companyRevenue(company.id);
            const pipeline = companyPipeline(company.id);
            const deals = companyOpps(company.id);
            const activeDeals = deals.filter((o) => !["won", "lost"].includes(o.stage));

            return (
              <div key={company.id}
                className="border border-neutral-800 rounded-lg p-5 hover:border-neutral-700 transition-colors bg-neutral-900/20">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <CompanyAvatar
                      id={company.id}
                      name={company.name}
                      logoUrl={company.logo_url}
                      uploadable
                      onLogoChange={(logoUrl) => handleLogoChange(company.id, logoUrl)}
                    />
                    <div>
                      <h3 className="font-medium text-neutral-200">{company.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {company.industry && (
                          <span className="text-xs text-neutral-600">{company.industry}</span>
                        )}
                        {company.website && (
                          <a href={`https://${company.website}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-neutral-600 hover:text-neutral-400 flex items-center gap-1 transition-colors">
                            <ExternalLink className="w-2.5 h-2.5" /> {company.website}
                          </a>
                        )}
                        {retainerBadge(company)}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => { setEditing(company); setFormOpen(true); }}
                    className="p-1.5 text-neutral-700 hover:text-neutral-400 hover:bg-neutral-800 rounded transition-colors">
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <p className="text-xs text-neutral-600 mb-1">Revenue (excl. VAT)</p>
                    <p className="text-sm font-mono text-emerald-400 font-medium">
                      {revenue > 0 ? formatCurrency(revenue) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-600 mb-1">Pipeline (excl. VAT)</p>
                    <p className="text-sm font-mono text-[#e8ff47] font-medium">
                      {pipeline > 0 ? formatCurrency(pipeline) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-600 mb-1">Deals</p>
                    <p className="text-sm font-mono text-neutral-300 font-medium">
                      {activeDeals.length} active
                    </p>
                  </div>
                </div>

                {deals.length > 0 && (
                  <div className="space-y-1.5 pt-3 border-t border-neutral-800">
                    {deals.slice(0, 3).map((opp) => (
                      <div key={opp.id} className="flex items-center justify-between">
                        <p className="text-xs text-neutral-400 truncate max-w-48">{opp.name}</p>
                        <StageBadge stage={opp.stage} />
                      </div>
                    ))}
                    {deals.length > 3 && (
                      <p className="text-xs text-neutral-700">+{deals.length - 3} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {companies.length === 0 && (
            <div className="col-span-2 py-20 text-center border border-neutral-800 rounded-lg">
              <Building2 className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-600 text-sm">No companies yet</p>
            </div>
          )}
        </div>
      )}

      <CompanyForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSave={handleSave}
        initial={editing}
      />
    </div>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Plus, ExternalLink, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { StageBadge } from "@/components/stage-badge";
import { getCompanies, getOpportunities, createCompany } from "@/lib/api";
import { Company, Opportunity } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

function CompanyForm({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (c: Company) => void;
}) {
  const [form, setForm] = useState({ name: "", industry: "", website: "", country: "NL" });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const company = await createCompany(form);
      onSave(company);
      onClose();
      setForm({ name: "", industry: "", website: "", country: "NL" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-neutral-100">Nieuw bedrijf</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Naam *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="bg-neutral-800 border-neutral-700 text-neutral-100"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Sector</Label>
            <Input
              value={form.industry}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
              placeholder="bijv. Technology, Finance, Retail"
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Website</Label>
            <Input
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              placeholder="example.com"
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 font-mono text-xs"
            />
          </div>
          <DialogFooter>
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
              {loading ? "Toevoegen..." : "Toevoegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    Promise.all([getCompanies(), getOpportunities()]).then(([c, o]) => {
      setCompanies(c);
      setOpps(o);
      setLoading(false);
    });
  }, []);

  const companyOpps = (companyId: string) =>
    opps.filter((o) => o.company_id === companyId);

  const companyRevenue = (companyId: string) =>
    companyOpps(companyId).reduce((s, o) => s + o.actual_value, 0);

  const companyPipeline = (companyId: string) =>
    companyOpps(companyId)
      .filter((o) => !["won", "lost"].includes(o.stage))
      .reduce((s, o) => s + o.expected_value, 0);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Bedrijven</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {companies.length} bedrijven
          </p>
        </div>
        <Button
          onClick={() => setFormOpen(true)}
          className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium gap-2"
        >
          <Plus className="w-4 h-4" />
          Nieuw bedrijf
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
            const activeDeals = deals.filter(
              (o) => !["won", "lost"].includes(o.stage)
            );

            return (
              <div
                key={company.id}
                className="border border-neutral-800 rounded-lg p-5 hover:border-neutral-700 transition-colors bg-neutral-900/20"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-neutral-500" />
                    </div>
                    <div>
                      <h3 className="font-medium text-neutral-200">{company.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {company.industry && (
                          <span className="text-xs text-neutral-600">
                            {company.industry}
                          </span>
                        )}
                        {company.website && (
                          <a
                            href={`https://${company.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-neutral-600 hover:text-neutral-400 flex items-center gap-1 transition-colors"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            {company.website}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <p className="text-xs text-neutral-600 mb-1">Omzet</p>
                    <p className="text-sm font-mono text-emerald-400 font-medium">
                      {revenue > 0 ? formatCurrency(revenue) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-600 mb-1">Pipeline</p>
                    <p className="text-sm font-mono text-[#e8ff47] font-medium">
                      {pipeline > 0 ? formatCurrency(pipeline) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-600 mb-1">Deals</p>
                    <p className="text-sm font-mono text-neutral-300 font-medium">
                      {activeDeals.length} actief
                    </p>
                  </div>
                </div>

                {deals.length > 0 && (
                  <div className="space-y-1.5 pt-3 border-t border-neutral-800">
                    {deals.slice(0, 3).map((opp) => (
                      <div key={opp.id} className="flex items-center justify-between">
                        <p className="text-xs text-neutral-400 truncate max-w-48">
                          {opp.name}
                        </p>
                        <StageBadge stage={opp.stage} />
                      </div>
                    ))}
                    {deals.length > 3 && (
                      <p className="text-xs text-neutral-700">
                        +{deals.length - 3} meer
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {companies.length === 0 && (
            <div className="col-span-2 py-20 text-center border border-neutral-800 rounded-lg">
              <Building2 className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-600 text-sm">Nog geen bedrijven</p>
            </div>
          )}
        </div>
      )}

      <CompanyForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={(company) => setCompanies((prev) => [...prev, company])}
      />
    </div>
  );
}

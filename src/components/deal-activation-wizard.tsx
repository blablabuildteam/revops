"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DealType,
  Opportunity,
  PaymentScheduleEntry,
  Project,
} from "@/lib/types";
import { createFinanceDeal, createProject, updateProject } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DealActivationWizardProps {
  open: boolean;
  onClose: () => void;
  opportunity: Opportunity | null;
  onComplete: (project: Project) => void;
}

const fc =
  "h-10 bg-neutral-800 border-neutral-700 text-neutral-100 text-sm placeholder:text-neutral-600";

function defaultProjectName(opp: Opportunity) {
  const company = opp.company?.name ?? "Client";
  return `${company} — ${opp.name}`;
}

function monthInputValue(date?: string) {
  if (!date) return "";
  return date.slice(0, 7);
}

export function DealActivationWizard({
  open,
  onClose,
  opportunity,
  onComplete,
}: DealActivationWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  const [projectName, setProjectName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [dealType, setDealType] = useState<DealType>("project");
  const [totalDealValue, setTotalDealValue] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("0");
  const [monthlyRevshare, setMonthlyRevshare] = useState("0");
  const [paymentSchedule, setPaymentSchedule] = useState<PaymentScheduleEntry[]>([
    { month: "", percentage: 50 },
    { month: "", percentage: 50 },
  ]);

  useEffect(() => {
    if (!open || !opportunity) return;
    setStep(1);
    setProject(null);
    setError(null);
    setProjectName(defaultProjectName(opportunity));
    setCompanyName(opportunity.company?.name ?? "");
    setDealType(opportunity.type === "retainer" ? "retainer" : "project");
    setTotalDealValue(String(opportunity.expected_value || 0));
    setStartDate(opportunity.start_date ?? "");
    setEndDate(opportunity.end_date ?? opportunity.close_date ?? "");
    setMonthlyFee(String(opportunity.expected_value || 0));
    setMonthlyRevshare("0");
    setPaymentSchedule([
      { month: monthInputValue(opportunity.start_date), percentage: 50 },
      { month: monthInputValue(opportunity.end_date ?? opportunity.close_date), percentage: 50 },
    ]);
  }, [open, opportunity]);

  const paymentTotal = useMemo(
    () => paymentSchedule.reduce((sum, entry) => sum + (Number(entry.percentage) || 0), 0),
    [paymentSchedule]
  );

  function updateSchedule(index: number, field: keyof PaymentScheduleEntry, value: string) {
    setPaymentSchedule((prev) =>
      prev.map((entry, i) =>
        i === index
          ? {
              ...entry,
              [field]: field === "percentage" ? Number(value) || 0 : value,
            }
          : entry
      )
    );
  }

  function addScheduleRow() {
    setPaymentSchedule((prev) => [...prev, { month: "", percentage: 0 }]);
  }

  function removeScheduleRow(index: number) {
    setPaymentSchedule((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreateProject() {
    if (!opportunity || !projectName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const created = await createProject({
        name: projectName.trim(),
        company_id: opportunity.company_id,
        opportunity_id: opportunity.id,
        status: "active",
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setProject(created);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDeal() {
    if (!opportunity || !project) return;
    if (!companyName.trim() || !projectName.trim()) {
      setError("Company and project name are required");
      return;
    }

    if (dealType === "project" && paymentTotal !== 100) {
      setError("Payment schedule percentages must total 100%");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (project.name !== projectName.trim()) {
        await updateProject(project.id, { name: projectName.trim() });
      }

      await createFinanceDeal({
        opportunity_id: opportunity.id,
        project_id: project.id,
        company_id: opportunity.company_id,
        company_name: companyName.trim(),
        project_name: projectName.trim(),
        deal_type: dealType,
        total_deal_value: dealType === "project" ? Number(totalDealValue) || 0 : 0,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        payment_schedule: dealType === "project" ? paymentSchedule.filter((e) => e.month) : [],
        monthly_fee: dealType === "retainer" ? Number(monthlyFee) || 0 : 0,
        monthly_revshare: dealType === "retainer" ? Number(monthlyRevshare) || 0 : 0,
        amount_paid: 0,
        payments: [],
      });
      onComplete(project);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create finance deal");
    } finally {
      setLoading(false);
    }
  }

  if (!opportunity) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 !max-w-3xl w-[92vw] p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-neutral-100 text-lg">
              Activate won deal
            </DialogTitle>
            <p className="text-sm text-neutral-500">
              Step {step} of 2 — {step === 1 ? "Create project" : "Create finance deal"}
            </p>
          </DialogHeader>

          <div className="flex items-center gap-2 mt-4">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium border",
                    step >= s
                      ? "bg-[#e8ff47]/10 border-[#e8ff47] text-[#e8ff47]"
                      : "border-neutral-700 text-neutral-600"
                  )}
                >
                  {s}
                </div>
                <span className={cn("text-xs", step >= s ? "text-neutral-300" : "text-neutral-600")}>
                  {s === 1 ? "Project" : "Finance deal"}
                </span>
                {s < 2 && <div className="flex-1 h-px bg-neutral-800" />}
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 space-y-5">
          {step === 1 ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-neutral-400 text-xs">Project name</Label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className={fc}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Start date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={fc}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">End date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={fc}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Company</Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={fc}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Project</Label>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className={fc}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-neutral-400 text-xs">Deal type</Label>
                <div className="flex gap-2">
                  {(["project", "retainer"] as DealType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDealType(type)}
                      className={cn(
                        "px-4 py-2 rounded text-sm font-medium border transition-colors",
                        dealType === type
                          ? "bg-[#e8ff47]/10 border-[#e8ff47] text-[#e8ff47]"
                          : "border-neutral-700 text-neutral-500 hover:text-neutral-300"
                      )}
                    >
                      {type === "project" ? "Project" : "Retainer"}
                    </button>
                  ))}
                </div>
              </div>

              {dealType === "project" ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-neutral-400 text-xs">Total deal value (€)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={totalDealValue}
                      onChange={(e) => setTotalDealValue(e.target.value)}
                      className={`${fc} font-mono`}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-neutral-400 text-xs">Payment schedule</Label>
                      <span className={cn(
                        "text-xs font-mono",
                        paymentTotal === 100 ? "text-emerald-400" : "text-orange-400"
                      )}>
                        Total: {paymentTotal}%
                      </span>
                    </div>
                    <div className="space-y-2">
                      {paymentSchedule.map((entry, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            type="month"
                            value={entry.month}
                            onChange={(e) => updateSchedule(index, "month", e.target.value)}
                            className={`${fc} flex-1`}
                          />
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={entry.percentage}
                            onChange={(e) => updateSchedule(index, "percentage", e.target.value)}
                            className={`${fc} w-24 font-mono`}
                          />
                          <span className="text-xs text-neutral-500">%</span>
                          {paymentSchedule.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeScheduleRow(index)}
                              className="p-2 text-neutral-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={addScheduleRow}
                      className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 gap-2 h-8"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add payment
                    </Button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-neutral-400 text-xs">Monthly fee (€)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={monthlyFee}
                      onChange={(e) => setMonthlyFee(e.target.value)}
                      className={`${fc} font-mono`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-neutral-400 text-xs">Monthly revshare (€)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={monthlyRevshare}
                      onChange={(e) => setMonthlyRevshare(e.target.value)}
                      className={`${fc} font-mono`}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">Start date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={fc}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-neutral-400 text-xs">End date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={fc}
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="text-red-400 text-xs bg-red-950/50 px-3 py-2 rounded">{error}</p>
          )}
        </div>

        <div className="flex justify-between gap-3 px-6 py-4 border-t border-neutral-800">
          <Button
            type="button"
            variant="ghost"
            onClick={step === 1 ? onClose : () => setStep(1)}
            className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          <Button
            type="button"
            disabled={
              loading ||
              (step === 1 && !projectName.trim()) ||
              (step === 2 && (!projectName.trim() || !companyName.trim()))
            }
            onClick={step === 1 ? handleCreateProject : handleCreateDeal}
            className="bg-[#e8ff47] hover:bg-[#d4eb30] text-neutral-950 font-medium"
          >
            {loading ? "Saving..." : step === 1 ? "Create project & continue" : "Create finance deal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const CARD = "border border-neutral-800 rounded-lg p-5 bg-neutral-900/40";
export const FIELD = "h-10 bg-neutral-800 border-neutral-700 text-neutral-100 text-sm";

export function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "accent" | "positive" | "warning";
}) {
  const valueTone = {
    default: "text-neutral-100",
    accent: "text-[#d4e052]",
    positive: "text-emerald-400",
    warning: "text-orange-300",
  }[tone];

  return (
    <div className="border border-neutral-800 rounded-lg px-5 py-4 bg-neutral-900/40">
      <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={cn("text-2xl font-mono font-semibold", valueTone)}>{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}

export function AmountRow({
  label,
  value,
  hint,
  tone = "default",
  emphasis = false,
  negative = false,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "muted" | "positive" | "negative" | "accent";
  emphasis?: boolean;
  /** Render as a subtraction, e.g. a deduction from the profit. */
  negative?: boolean;
}) {
  const valueTone = {
    default: "text-neutral-200",
    muted: "text-neutral-400",
    positive: "text-emerald-400",
    negative: "text-red-400",
    accent: "text-[#d4e052]",
  }[tone];

  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-1.5",
        emphasis && "border-t border-neutral-800 mt-1 pt-2.5",
      )}
    >
      <div className="min-w-0">
        <span className={cn("text-sm", emphasis ? "text-neutral-200 font-medium" : "text-neutral-400")}>
          {label}
        </span>
        {hint && <p className="text-[11px] text-neutral-600 mt-0.5">{hint}</p>}
      </div>
      <span
        className={cn(
          "font-mono shrink-0 tabular-nums",
          emphasis ? "text-base font-semibold" : "text-sm",
          valueTone,
        )}
      >
        {negative && value !== 0 ? "−" : ""}
        {formatCurrency(Math.abs(value))}
      </span>
    </div>
  );
}

export function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 h-10 rounded-md border text-sm transition-colors",
        active
          ? "bg-[#d4e052]/10 border-[#d4e052] text-[#d4e052]"
          : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200",
      )}
    >
      {children}
    </button>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  step = 100,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-neutral-400 text-xs">{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500 pointer-events-none">
            {prefix}
          </span>
        )}
        <Input
          type="number"
          inputMode="numeric"
          step={step}
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const next = parseFloat(e.target.value);
            onChange(Number.isFinite(next) ? next : 0);
          }}
          className={cn(FIELD, "font-mono", prefix && "pl-7", suffix && "pr-8")}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-[11px] text-neutral-600">{hint}</p>}
    </div>
  );
}

export function Disclaimer({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-relaxed text-neutral-600 border-l-2 border-neutral-800 pl-3">
      {children}
    </p>
  );
}

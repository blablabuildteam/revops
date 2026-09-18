import { cn } from "@/lib/utils";

export function HoursMeter({
  label,
  used,
  cap,
  className,
}: {
  label: string;
  used: number;
  cap: number;
  className?: string;
}) {
  const over = cap > 0 && used > cap;
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div className={cn("space-y-1 min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-neutral-500">{label}</span>
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            over ? "text-amber-300" : "text-neutral-200",
          )}
        >
          {used.toFixed(1)} / {cap}u
        </span>
      </div>
      <div
        className="h-1.5 bg-neutral-800 rounded-full overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={cap || undefined}
        aria-valuenow={used}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over ? "bg-amber-400" : "bg-[#d4e052]",
          )}
          style={{ width: `${over ? 100 : pct}%` }}
        />
      </div>
      {over && (
        <p className="text-[10px] text-amber-400/90 text-right">
          +{(used - cap).toFixed(1)}u over
        </p>
      )}
    </div>
  );
}

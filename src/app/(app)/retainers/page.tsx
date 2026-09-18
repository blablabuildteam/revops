"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { HoursMeter } from "@/components/hours-meter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUndoToast } from "@/components/mutation-provider";
import { useRetainers } from "@/hooks/use-api-data";
import {
  createRetainerTimeEntry,
  deleteRetainerTimeEntry,
  updateRetainerAgreement,
  updateRetainerTimeEntry,
} from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import {
  addDays,
  currentBillingPeriod,
  defaultWorkDateForWeek,
  entryInPeriod,
  entryInWeek,
  estimateInvoiceAmount,
  flexHoursBalance,
  formatWeekLabel,
  hoursInBillingPeriod,
  includedHoursForPeriod,
  includedHoursForWeek,
  listRetainerBillingPeriods,
  sumHours,
  weekStartFromDateOnly,
  weekStartOf,
} from "@/lib/retainers";
import {
  RetainerTimeEntry,
  RetainerWithEntries,
  TASK_ASSIGNEES,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_LABELS = {
  active: "Actief",
  upcoming: "Komt eraan",
  paused: "Gepauzeerd",
  ended: "Gestopt",
} as const;

function RetainerCard({
  retainer,
  weekStart,
}: {
  retainer: RetainerWithEntries;
  weekStart: string;
}) {
  const withUndo = useUndoToast();
  const [hours, setHours] = useState("");
  const [activity, setActivity] = useState("");
  const [workDate, setWorkDate] = useState(() =>
    defaultWorkDateForWeek(weekStart),
  );
  const [category, setCategory] = useState<string>("");
  const [loggedBy, setLoggedBy] = useState<string>(TASK_ASSIGNEES[0]);
  const [saving, setSaving] = useState(false);
  const [newRepo, setNewRepo] = useState("");
  const [repoBusy, setRepoBusy] = useState(false);

  const period = useMemo(
    () => currentBillingPeriod(retainer),
    [retainer],
  );
  const periods = useMemo(
    () => listRetainerBillingPeriods(retainer),
    [retainer],
  );

  const weekEntries = useMemo(
    () => (retainer.entries ?? []).filter((e) => entryInWeek(e, weekStart)),
    [retainer.entries, weekStart],
  );
  const periodEntries = useMemo(
    () =>
      period
        ? (retainer.entries ?? []).filter((e) => entryInPeriod(e, period))
        : [],
    [retainer.entries, period],
  );

  const weekHours = sumHours(weekEntries);
  const periodHours = sumHours(periodEntries);
  const weekCap = includedHoursForWeek(retainer);
  const periodCap = includedHoursForPeriod(retainer);
  const periodInvoice = estimateInvoiceAmount(retainer, periodHours);
  const flex = retainer.flex_hours ? flexHoursBalance(retainer) : null;
  const invoiced = new Set(retainer.invoiced_periods ?? []);

  useEffect(() => {
    setWorkDate(defaultWorkDateForWeek(weekStart));
  }, [weekStart]);

  // Allow logging in any week that overlaps/starts after the retainer start
  // (not vs week Monday — mid-week starts like Adsomnia 15th broke that).
  const weekEnd = addDays(weekStart, 6);
  const startOk = /^\d{4}-\d{2}-\d{2}$/.test(retainer.start_date);
  const canLog =
    retainer.status !== "ended" &&
    retainer.status !== "paused" &&
    (!startOk || retainer.start_date <= weekEnd);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const h = parseFloat(hours);
    if (!activity.trim() || !Number.isFinite(h) || h <= 0) return;
    const date = workDate || defaultWorkDateForWeek(weekStart);
    setSaving(true);
    let createdId: string | null = null;
    try {
      await withUndo({
        label: "Uren gelogd",
        run: async () => {
          const created = await createRetainerTimeEntry(retainer.id, {
            week_start: weekStartFromDateOnly(date),
            hours: h,
            activity: activity.trim(),
            category: category || null,
            logged_by: loggedBy,
            work_date: date,
          });
          createdId = created.id;
          setHours("");
          setActivity("");
        },
        undo: async () => {
          if (createdId) {
            await deleteRetainerTimeEntry(createdId, retainer.id);
          }
        },
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleWorkDateChange(
    entry: RetainerTimeEntry,
    next: string,
  ) {
    if ((entry.work_date ?? "") === next) return;
    await withUndo({
      label: next ? "Datum bijgewerkt" : "Datum verwijderd",
      run: async () => {
        await updateRetainerTimeEntry(entry.id, {
          work_date: next || null,
          week_start: next
            ? weekStartFromDateOnly(next)
            : entry.week_start,
        });
      },
      undo: async () => {
        await updateRetainerTimeEntry(entry.id, {
          work_date: entry.work_date ?? null,
          week_start: entry.week_start,
        });
      },
    });
  }

  async function handleDelete(entryId: string) {
    const snapshot = weekEntries.find((e) => e.id === entryId);
    await withUndo({
      label: "Regel verwijderd",
      run: async () => {
        await deleteRetainerTimeEntry(entryId, retainer.id);
      },
      undo: async () => {
        if (!snapshot) return;
        await createRetainerTimeEntry(retainer.id, {
          week_start: snapshot.week_start,
          hours: snapshot.hours,
          activity: snapshot.activity,
          category: snapshot.category,
          logged_by: snapshot.logged_by,
          work_date: snapshot.work_date,
        });
      },
    });
  }

  async function togglePeriodInvoiced(periodKey: string) {
    const next = !invoiced.has(periodKey);
    await withUndo({
      label: next ? "Periode gefactureerd" : "Factuurstatus teruggezet",
      run: async () => {
        await updateRetainerAgreement(retainer.id, {
          toggle_period: periodKey,
        });
      },
      undo: async () => {
        await updateRetainerAgreement(retainer.id, {
          toggle_period: periodKey,
        });
      },
    });
  }

  async function addRepo(e: React.FormEvent) {
    e.preventDefault();
    const name = newRepo.trim().replace(/^\/+|\/+$/g, "");
    if (!name || repoBusy) return;
    const current = retainer.linked_repos ?? [];
    if (current.some((r) => r.toLowerCase() === name.toLowerCase())) {
      setNewRepo("");
      return;
    }
    const next = [...current, name];
    setRepoBusy(true);
    try {
      await withUndo({
        label: "Repo gekoppeld",
        run: async () => {
          await updateRetainerAgreement(retainer.id, { linked_repos: next });
          setNewRepo("");
        },
        undo: async () => {
          await updateRetainerAgreement(retainer.id, { linked_repos: current });
        },
      });
    } finally {
      setRepoBusy(false);
    }
  }

  async function removeRepo(repo: string) {
    const current = retainer.linked_repos ?? [];
    const next = current.filter((r) => r !== repo);
    await withUndo({
      label: "Repo ontkoppeld",
      run: async () => {
        await updateRetainerAgreement(retainer.id, { linked_repos: next });
      },
      undo: async () => {
        await updateRetainerAgreement(retainer.id, { linked_repos: current });
      },
    });
  }

  return (
    <section className="border border-neutral-800 rounded-lg bg-neutral-900/20 overflow-hidden">
      <div className="px-4 py-4 border-b border-neutral-800/80 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-neutral-100">
                {retainer.client_name}
              </h2>
              <span
                className={cn(
                  "text-[11px] px-1.5 py-0.5 rounded",
                  retainer.status === "active" &&
                    "bg-[#d4e052]/10 text-[#d4e052]",
                  retainer.status === "upcoming" &&
                    "bg-blue-500/10 text-blue-300",
                  retainer.status === "paused" &&
                    "bg-neutral-800 text-neutral-400",
                  retainer.status === "ended" &&
                    "bg-neutral-900 text-neutral-600",
                )}
              >
                {STATUS_LABELS[retainer.status]}
              </span>
              {retainer.flex_hours && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                  Flex uren
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Start {retainer.start_date}
              {" · "}
              {retainer.hours_cadence === "weekly"
                ? `${retainer.hours_included}u / week`
                : `${retainer.hours_included}u / maand`}
              {" · "}
              {formatCurrency(retainer.hourly_rate)} / uur
              {" · "}
              {retainer.period_anchor === "start_day"
                ? "rolling vanaf startdag"
                : "kalendermaand"}
            </p>
            {retainer.notes && (
              <p className="text-[11px] text-neutral-600 mt-1">{retainer.notes}</p>
            )}
            <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
              <p className="text-[11px] text-neutral-500">Gekoppelde repos</p>
              <div className="flex flex-wrap gap-1.5 items-center">
                {(retainer.linked_repos ?? []).map((repo) => (
                  <span
                    key={repo}
                    className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300"
                  >
                    {repo}
                    <button
                      type="button"
                      onClick={() => void removeRepo(repo)}
                      className="text-neutral-600 hover:text-red-400"
                      title="Ontkoppelen"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <form onSubmit={(e) => void addRepo(e)} className="inline-flex gap-1">
                  <input
                    value={newRepo}
                    onChange={(e) => setNewRepo(e.target.value)}
                    placeholder="+ repo"
                    className="w-28 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-[11px] text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-neutral-500"
                  />
                  <button
                    type="submit"
                    disabled={repoBusy || !newRepo.trim()}
                    className="text-[11px] text-[#d4e052] hover:underline disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>
              </div>
            </div>
            {(retainer.hour_buckets?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {retainer.hour_buckets.slice(0, 8).map((b) => (
                  <span
                    key={b.id}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800/80 text-neutral-400"
                    title={b.notes ?? undefined}
                  >
                    {b.label}
                    {b.estimated_hours != null ? ` · ~${b.estimated_hours}u` : ""}
                  </span>
                ))}
                {retainer.hour_buckets.length > 8 && (
                  <span className="text-[10px] text-neutral-600">
                    +{retainer.hour_buckets.length - 8}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="w-full sm:w-56 space-y-3">
            <HoursMeter label="Week" used={weekHours} cap={weekCap} />
            {period && (
              <HoursMeter
                label="Periode"
                used={periodHours}
                cap={periodCap}
              />
            )}
            {period && (
              <p className="text-xs text-neutral-500 text-right">
                Deze periode ·{" "}
                <span className="font-mono text-neutral-200">
                  {formatCurrency(periodInvoice)}
                </span>
              </p>
            )}
            {flex && (
              <p className="text-xs text-neutral-500 text-right">
                Urenbank ·{" "}
                <span
                  className={cn(
                    "font-mono",
                    flex.balance < 0 ? "text-amber-300" : "text-emerald-300/90",
                  )}
                >
                  {flex.balance > 0 ? "+" : ""}
                  {flex.balance}u
                </span>
              </p>
            )}
            <Link
              href={`/retainers/${retainer.id}`}
              className="flex items-center justify-end gap-1.5 text-xs text-neutral-400 hover:text-[#d4e052] pt-2 mt-2 border-t border-neutral-800/60 transition-colors"
            >
              Bekijk details
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Invoice periods */}
      {periods.length > 0 && (
        <div className="px-4 py-3 border-b border-neutral-800/80 space-y-2">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">
            Facturatie (achteraf)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {periods.map((p) => {
              const done = invoiced.has(p.key);
              const h = hoursInBillingPeriod(retainer, p);
              const amt = estimateInvoiceAmount(retainer, h);
              const ended = p.end < weekStartOf();
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => void togglePeriodInvoiced(p.key)}
                  title={`${p.label} · ${h}u · ${formatCurrency(amt)} · factuur ${p.invoiceMonth}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-colors",
                    done
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : ended
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-400/50"
                        : "border-neutral-700 bg-neutral-950/40 text-neutral-400 hover:border-neutral-500",
                  )}
                >
                  <span
                    className={cn(
                      "w-3 h-3 rounded-sm border flex items-center justify-center",
                      done ? "border-emerald-400" : "border-neutral-600",
                    )}
                  >
                    {done && <Check className="w-2 h-2" />}
                  </span>
                  <span>{p.label}</span>
                  <span className="font-mono opacity-70">
                    {formatCurrency(amt)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-4 py-3 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">
            Uren loggen · week {formatWeekLabel(weekStart)}
          </p>
          <HoursMeter
            label="Deze week"
            used={weekHours}
            cap={weekCap}
            className="sm:w-48"
          />
        </div>

        {canLog ? (
          <form
            onSubmit={(e) => void handleAdd(e)}
            className="rounded-lg border border-[#d4e052]/25 bg-[#d4e052]/5 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[5.5rem_9.5rem_1fr_9rem_8rem_auto] gap-2 items-end"
          >
            <div className="space-y-1">
              <Label className="text-[11px] text-neutral-500">Uren</Label>
              <Input
                type="number"
                step="0.25"
                min="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="8"
                className="bg-neutral-900 border-neutral-700 h-9"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-neutral-500">Datum</Label>
              <DatePicker
                value={workDate}
                onChange={setWorkDate}
                placeholder="Kies datum"
                className="h-9 bg-neutral-900 border-neutral-700 text-neutral-100"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-neutral-500">Wat gedaan?</Label>
              <Input
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="bijv. deleted-users kickoff"
                className="bg-neutral-900 border-neutral-700 h-9"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-neutral-500">Bucket</Label>
              <Select
                value={category || "__none__"}
                onValueChange={(v) =>
                  setCategory(!v || v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger className="w-full bg-neutral-900 border-neutral-700 h-9">
                  <SelectValue placeholder="Optioneel">
                    {category || "Geen"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="start">
                  <SelectItem value="__none__">Geen</SelectItem>
                  {(retainer.hour_buckets ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.label}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-neutral-500">Door</Label>
              <Select
                value={loggedBy}
                onValueChange={(v) => setLoggedBy(v ?? TASK_ASSIGNEES[0])}
              >
                <SelectTrigger className="w-full bg-neutral-900 border-neutral-700 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="start">
                  {TASK_ASSIGNEES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="h-9 bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Log uren
            </Button>
          </form>
        ) : (
          <p className="text-xs text-neutral-600">
            {retainer.status === "paused" || retainer.status === "ended"
              ? "Deze retainer is niet actief."
              : startOk && retainer.start_date > weekEnd
                ? `Logging start vanaf ${retainer.start_date}.`
                : "Logging niet beschikbaar voor deze week."}
          </p>
        )}

        {weekEntries.length === 0 ? (
          <p className="text-sm text-neutral-600 py-1">
            Nog geen uren deze week — vul hierboven in en klik Log uren.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800/80 border border-neutral-800 rounded-lg overflow-hidden">
            {[...weekEntries]
              .sort((a, b) => {
                const da = a.work_date || a.week_start || "";
                const db = b.work_date || b.week_start || "";
                if (da !== db) return da.localeCompare(db);
                return (a.created_at || "").localeCompare(b.created_at || "");
              })
              .map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap sm:flex-nowrap items-start gap-3 px-3 py-2.5 bg-neutral-950/30"
              >
                <DatePicker
                  value={entry.work_date ?? ""}
                  onChange={(next) => void handleWorkDateChange(entry, next)}
                  placeholder="Datum"
                  size="sm"
                  className="h-8 w-[8.75rem] shrink-0 bg-neutral-900 border-neutral-700 text-neutral-200"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-200">{entry.activity}</p>
                  <p className="text-[11px] text-neutral-600 mt-0.5">
                    {entry.logged_by ?? "—"}
                    {entry.category ? ` · ${entry.category}` : ""}
                  </p>
                </div>
                <span className="font-mono text-sm text-neutral-300 shrink-0">
                  {Number(entry.hours).toFixed(1)}u
                </span>
                <button
                  type="button"
                  onClick={() => void handleDelete(entry.id)}
                  className="p-1 text-neutral-700 hover:text-red-400"
                  title="Verwijderen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function RetainersPage() {
  const { data: retainers = [], isLoading } = useRetainers();
  const loading = isLoading && retainers.length === 0;
  const [weekStart, setWeekStart] = useState(() => weekStartOf());

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-neutral-100">
            Retainers
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Uren per week · activiteiten · factuur achteraf afvinken
          </p>
        </div>
        <div className="flex items-center gap-1 border border-neutral-800 rounded-lg bg-neutral-900/40 px-1">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="p-2 text-neutral-500 hover:text-neutral-200"
            aria-label="Vorige week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-neutral-200 min-w-[10rem] text-center px-2">
            {formatWeekLabel(weekStart)}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="p-2 text-neutral-500 hover:text-neutral-200"
            aria-label="Volgende week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(weekStartOf())}
            className="text-[11px] text-neutral-500 hover:text-neutral-300 px-2 py-1"
          >
            Nu
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Actieve retainers</p>
          <p className="text-lg font-mono text-[#d4e052] font-medium">
            {retainers.filter((r) => r.status === "active").length}
          </p>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/20">
          <p className="text-xs text-neutral-500 mb-1">Open te factureren</p>
          <p className="text-lg font-mono text-amber-300/90 font-medium">
            {
              retainers.reduce((n, r) => {
                const inv = new Set(r.invoiced_periods ?? []);
                return (
                  n +
                  listRetainerBillingPeriods(r).filter(
                    (p) => p.end < weekStartOf() && !inv.has(p.key),
                  ).length
                );
              }, 0)
            }
          </p>
          <p className="text-[11px] text-neutral-600 mt-0.5">
            Afgesloten periodes nog niet afgevinkt
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-48 border border-neutral-800 rounded-lg animate-pulse" />
          <div className="h-48 border border-neutral-800 rounded-lg animate-pulse" />
        </div>
      ) : retainers.length === 0 ? (
        <div className="py-20 text-center border border-neutral-800 rounded-lg">
          <Repeat className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-600 text-sm">Nog geen retainers</p>
        </div>
      ) : (
        <div className="space-y-4">
          {retainers.map((retainer) => (
            <RetainerCard
              key={retainer.id}
              retainer={retainer}
              weekStart={weekStart}
            />
          ))}
        </div>
      )}
    </div>
  );
}

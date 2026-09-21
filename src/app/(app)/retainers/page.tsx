"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoursMeter } from "@/components/hours-meter";
import { RetainerLogForm } from "@/components/retainer-log-form";
import { SlackChannelBinder } from "@/components/slack-channel-picker";
import { suggestedSlackChannelName } from "@/lib/slack-channel-name";
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
  addMonths,
  currentBillingPeriod,
  defaultWorkDateForWeek,
  entryInMonth,
  entryInPeriod,
  entryInWeek,
  estimateInvoiceAmount,
  flexHoursBalance,
  formatDayLabel,
  formatMonthLabel,
  formatWeekLabel,
  hoursInBillingPeriod,
  includedHoursForPeriod,
  includedHoursForWeek,
  listRetainerBillingPeriods,
  monthKeyOf,
  sumHours,
  weekStartFromDateOnly,
  weekStartOf,
  weeksInMonth,
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
  monthKey,
}: {
  retainer: RetainerWithEntries;
  monthKey: string;
}) {
  const withUndo = useUndoToast();
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [hours, setHours] = useState("");
  const [activity, setActivity] = useState("");
  const [workDate, setWorkDate] = useState(() =>
    defaultWorkDateForWeek(weekStartOf()),
  );
  const [category, setCategory] = useState<string>("");
  const [loggedBy, setLoggedBy] = useState<string>(TASK_ASSIGNEES[0]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState("");
  const [editActivity, setEditActivity] = useState("");
  const [editWorkDate, setEditWorkDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editLoggedBy, setEditLoggedBy] = useState<string>(TASK_ASSIGNEES[0]);
  const [editSaving, setEditSaving] = useState(false);
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

  // Get all weeks that overlap this month
  const weeks = useMemo(() => weeksInMonth(monthKey), [monthKey]);

  // Entries for this month
  const monthEntries = useMemo(
    () => (retainer.entries ?? []).filter((e) => entryInMonth(e, monthKey)),
    [retainer.entries, monthKey],
  );

  const periodEntries = useMemo(
    () =>
      period
        ? (retainer.entries ?? []).filter((e) => entryInPeriod(e, period))
        : [],
    [retainer.entries, period],
  );

  const monthHours = sumHours(monthEntries);
  const periodHours = sumHours(periodEntries);
  const weekCap = includedHoursForWeek(retainer);
  const periodCap = includedHoursForPeriod(retainer);
  const periodInvoice = estimateInvoiceAmount(retainer, periodHours);
  const flex = retainer.flex_hours ? flexHoursBalance(retainer) : null;
  const invoiced = new Set(retainer.invoiced_periods ?? []);

  useEffect(() => {
    setEditingId(null);
    // Auto-expand current week if it's in this month
    const currentWeek = weekStartOf();
    if (weeks.includes(currentWeek)) {
      setExpandedWeek(currentWeek);
    } else {
      setExpandedWeek(weeks[weeks.length - 1] ?? null);
    }
  }, [monthKey, weeks]);

  // Update workDate when expanded week changes
  useEffect(() => {
    if (expandedWeek) {
      setWorkDate(defaultWorkDateForWeek(expandedWeek));
    }
  }, [expandedWeek]);

  // Check if logging is allowed for the current retainer
  const startOk = /^\d{4}-\d{2}-\d{2}$/.test(retainer.start_date);
  const canLogAny =
    retainer.status !== "ended" &&
    retainer.status !== "paused";

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!expandedWeek) return;
    const h = parseFloat(hours);
    if (!activity.trim() || !Number.isFinite(h) || h <= 0) return;
    const date = workDate || defaultWorkDateForWeek(expandedWeek);
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

  function startEdit(entry: RetainerTimeEntry, weekStart: string) {
    setEditingId(entry.id);
    setEditHours(String(entry.hours));
    setEditActivity(entry.activity);
    setEditWorkDate(entry.work_date || defaultWorkDateForWeek(weekStart));
    setEditCategory(entry.category ?? "");
    setEditLoggedBy(entry.logged_by || TASK_ASSIGNEES[0]);
  }

  async function handleUpdate(e: React.FormEvent, weekStart: string) {
    e.preventDefault();
    if (!editingId) return;
    const allEntries = retainer.entries ?? [];
    const entry = allEntries.find((item) => item.id === editingId);
    if (!entry) return;
    const h = parseFloat(editHours);
    if (!editActivity.trim() || !Number.isFinite(h) || h <= 0) return;
    const date = editWorkDate || defaultWorkDateForWeek(weekStart);
    setEditSaving(true);
    try {
      await withUndo({
        label: "Uren bijgewerkt",
        run: async () => {
          await updateRetainerTimeEntry(entry.id, {
            hours: h,
            activity: editActivity.trim(),
            category: editCategory || null,
            logged_by: editLoggedBy,
            work_date: date,
            week_start: weekStartFromDateOnly(date),
          });
          setEditingId(null);
        },
        undo: async () => {
          await updateRetainerTimeEntry(entry.id, {
            hours: entry.hours,
            activity: entry.activity,
            category: entry.category,
            logged_by: entry.logged_by,
            work_date: entry.work_date ?? null,
            week_start: entry.week_start,
          });
        },
      });
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(entryId: string) {
    const allEntries = retainer.entries ?? [];
    const snapshot = allEntries.find((e) => e.id === entryId);
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

  function getWeekEntries(weekStart: string) {
    return (retainer.entries ?? []).filter((e) => entryInWeek(e, weekStart));
  }

  function canLogForWeek(weekStart: string) {
    const weekEnd = addDays(weekStart, 6);
    return canLogAny && (!startOk || retainer.start_date <= weekEnd);
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
            </p>
            {retainer.notes && (
              <p className="text-[11px] text-neutral-600 mt-1">{retainer.notes}</p>
            )}
            <div className="mt-3">
              <SlackChannelBinder
                kind="retainer"
                id={retainer.id}
                channelId={retainer.slack_channel_id}
                channelName={retainer.slack_channel_name}
                suggestedName={suggestedSlackChannelName(retainer.client_name, "retainer")}
                compact
              />
            </div>
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
            <HoursMeter label="Deze maand" used={monthHours} cap={periodCap} />
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

      {/* Weekly breakdowns */}
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-neutral-500 uppercase tracking-wide">
          Weken in {formatMonthLabel(monthKey)}
        </p>

        <div className="space-y-2">
          {weeks.map((weekStart) => {
            const weekEntries = getWeekEntries(weekStart);
            const weekHours = sumHours(weekEntries);
            const isExpanded = expandedWeek === weekStart;
            const canLog = canLogForWeek(weekStart);
            const isCurrentWeek = weekStart === weekStartOf();

            return (
              <div
                key={weekStart}
                className="border border-neutral-800 rounded-lg overflow-hidden"
              >
                {/* Week header - clickable to expand */}
                <button
                  type="button"
                  onClick={() => setExpandedWeek(isExpanded ? null : weekStart)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors",
                    isExpanded
                      ? "bg-neutral-800/50"
                      : "bg-neutral-900/30 hover:bg-neutral-900/50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      className={cn(
                        "w-4 h-4 text-neutral-500 transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                    <span className="text-sm text-neutral-200">
                      {formatWeekLabel(weekStart)}
                    </span>
                    {isCurrentWeek && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#d4e052]/20 text-[#d4e052]">
                        Nu
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "font-mono text-sm tabular-nums",
                        weekHours > weekCap
                          ? "text-amber-300"
                          : weekHours > 0
                            ? "text-neutral-200"
                            : "text-neutral-600",
                      )}
                    >
                      {weekHours.toFixed(1)}u
                    </span>
                    <span className="text-xs text-neutral-600">
                      / {weekCap}u
                    </span>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-neutral-800/80 px-3 py-3 space-y-3">
                    {canLog ? (
                      <RetainerLogForm
                        values={{ hours, workDate, activity, category, loggedBy }}
                        onChange={(patch) => {
                          if (patch.hours !== undefined) setHours(patch.hours);
                          if (patch.workDate !== undefined) setWorkDate(patch.workDate);
                          if (patch.activity !== undefined) setActivity(patch.activity);
                          if (patch.category !== undefined) setCategory(patch.category);
                          if (patch.loggedBy !== undefined) setLoggedBy(patch.loggedBy);
                        }}
                        buckets={retainer.hour_buckets ?? []}
                        saving={saving}
                        submitLabel="Log uren"
                        submitIcon={Plus}
                        onSubmit={(e) => void handleAdd(e)}
                      />
                    ) : (
                      <p className="text-xs text-neutral-600">
                        {retainer.status === "paused" || retainer.status === "ended"
                          ? "Deze retainer is niet actief."
                          : `Logging start vanaf ${retainer.start_date}.`}
                      </p>
                    )}

                    {weekEntries.length === 0 ? (
                      <p className="text-sm text-neutral-600 py-1">
                        Nog geen uren deze week.
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
                            className="bg-neutral-950/30"
                          >
                            {editingId === entry.id ? (
                              <div className="p-2.5">
                                <RetainerLogForm
                                  values={{
                                    hours: editHours,
                                    workDate: editWorkDate,
                                    activity: editActivity,
                                    category: editCategory,
                                    loggedBy: editLoggedBy,
                                  }}
                                  onChange={(patch) => {
                                    if (patch.hours !== undefined) setEditHours(patch.hours);
                                    if (patch.workDate !== undefined) {
                                      setEditWorkDate(patch.workDate);
                                    }
                                    if (patch.activity !== undefined) {
                                      setEditActivity(patch.activity);
                                    }
                                    if (patch.category !== undefined) {
                                      setEditCategory(patch.category);
                                    }
                                    if (patch.loggedBy !== undefined) {
                                      setEditLoggedBy(patch.loggedBy);
                                    }
                                  }}
                                  buckets={retainer.hour_buckets ?? []}
                                  saving={editSaving}
                                  submitLabel="Opslaan"
                                  submitIcon={Check}
                                  onSubmit={(e) => void handleUpdate(e, weekStart)}
                                  onCancel={() => setEditingId(null)}
                                  autoFocus
                                  extraActions={
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => setEditingId(null)}
                                      className="h-9 border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
                                    >
                                      Annuleren
                                    </Button>
                                  }
                                />
                              </div>
                            ) : (
                              <div className="flex flex-wrap sm:flex-nowrap items-start gap-3 px-3 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => startEdit(entry, weekStart)}
                                  title="Klik om te bewerken"
                                  className="flex-1 min-w-0 flex flex-wrap sm:flex-nowrap items-start gap-3 text-left rounded-md -m-1 p-1 hover:bg-neutral-900/50 transition-colors group"
                                >
                                  <span className="text-xs text-neutral-500 font-mono w-[8.75rem] shrink-0 pt-1">
                                    {formatDayLabel(entry.work_date || entry.week_start)}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-neutral-200">{entry.activity}</p>
                                    <p className="text-[11px] text-neutral-600 mt-0.5">
                                      {entry.logged_by ?? "—"}
                                      {entry.category ? ` · ${entry.category}` : ""}
                                    </p>
                                  </div>
                                  <span className="font-mono text-sm text-neutral-300 shrink-0 pt-0.5">
                                    {Number(entry.hours).toFixed(1)}u
                                  </span>
                                  <Pencil className="w-3.5 h-3.5 text-neutral-700 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 mt-1 shrink-0" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(entry.id)}
                                  className="p-1 text-neutral-700 hover:text-red-400"
                                  title="Verwijderen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function RetainersPage() {
  const { data: retainers = [], isLoading } = useRetainers();
  const loading = isLoading && retainers.length === 0;
  const [monthKey, setMonthKey] = useState(() => monthKeyOf());

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-neutral-100">
            Retainers
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Maandoverzicht met wekelijkse breakdown
          </p>
        </div>
        <div className="flex items-center gap-1 border border-neutral-800 rounded-lg bg-neutral-900/40 px-1">
          <button
            type="button"
            onClick={() => setMonthKey((m) => addMonths(m, -1))}
            className="p-2 text-neutral-500 hover:text-neutral-200"
            aria-label="Vorige maand"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-neutral-200 min-w-[10rem] text-center px-2 capitalize">
            {formatMonthLabel(monthKey)}
          </span>
          <button
            type="button"
            onClick={() => setMonthKey((m) => addMonths(m, 1))}
            className="p-2 text-neutral-500 hover:text-neutral-200"
            aria-label="Volgende maand"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setMonthKey(monthKeyOf())}
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
              monthKey={monthKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

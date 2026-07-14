"use client"

import * as React from "react"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatDate, toDateInputValue } from "@/lib/format"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const

function parseValue(value?: string): Date | null {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, y, m, d] = match
  return new Date(Number(y), Number(m) - 1, Number(d))
}

function toValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []

  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day))
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return cells
}

type CalendarProps = {
  value?: string
  onSelect: (value: string) => void
  className?: string
}

function Calendar({ value, onSelect, className }: CalendarProps) {
  const selected = parseValue(value)
  const today = React.useMemo(() => new Date(), [])
  const [viewDate, setViewDate] = React.useState(() => selected ?? today)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const days = getCalendarDays(year, month)
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(viewDate)

  return (
    <div className={cn("w-[260px]", className)}>
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="flex size-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium text-neutral-100">{monthLabel}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="flex size-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 px-1">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="flex h-8 items-center justify-center text-[0.65rem] font-medium uppercase tracking-wide text-neutral-500"
          >
            {day}
          </div>
        ))}
        {days.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="h-8" />
          }

          const isSelected = selected ? isSameDay(date, selected) : false
          const isToday = isSameDay(date, today)

          return (
            <button
              key={toValue(date)}
              type="button"
              onClick={() => onSelect(toValue(date))}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-sm transition-colors",
                isSelected
                  ? "bg-[#e8ff47] font-medium text-neutral-950"
                  : "text-neutral-200 hover:bg-neutral-800 hover:text-neutral-50",
                isToday && !isSelected && "ring-1 ring-[#e8ff47]/40"
              )}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>

      {value && (
        <div className="mt-2 border-t border-neutral-800 px-1 pt-2">
          <button
            type="button"
            onClick={() => onSelect("")}
            className="w-full rounded-md px-2 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            Clear date
          </button>
        </div>
      )}
    </div>
  )
}

type DatePickerProps = {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  size?: "default" | "sm"
  showIcon?: boolean
  disabled?: boolean
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>
}

function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  size = "default",
  showIcon = true,
  disabled,
  onClick,
  onPointerDown,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const displayValue = value ? formatDate(value) : placeholder
  const normalizedValue = toDateInputValue(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        onClick={onClick}
        onPointerDown={onPointerDown}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-input bg-transparent text-left transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "dark:bg-input/30",
          size === "default" && "h-8 px-2.5 text-sm",
          size === "sm" && "h-7 px-2 text-xs",
          !value && "text-muted-foreground",
          className
        )}
      >
        {showIcon && (
          <CalendarIcon
            className={cn(
              "shrink-0 text-neutral-500",
              size === "default" ? "size-3.5" : "size-3"
            )}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{displayValue}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <Calendar
          key={normalizedValue || "empty"}
          value={normalizedValue}
          onSelect={(next) => {
            onChange?.(next)
            if (next) setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { Calendar, DatePicker }

"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  FinanceDeal,
  expectedRevenueBreakdownForMonth,
  actualRevenueBreakdownForMonth,
  type RevenueBreakdownItem,
} from "@/lib/types";

export type InsightPoint = {
  month: string;
  expected: number;
  actual: number;
  forecast: number;
  netAfterSalary: number;
};

function BreakdownItems({
  breakdown,
  amountClassName,
  onDealClick,
}: {
  breakdown: RevenueBreakdownItem[];
  amountClassName: string;
  onDealClick?: (dealId: string) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {breakdown.map((item) => {
        const content = (
          <>
            <div className="min-w-0">
              <p className="text-neutral-200 truncate">{item.projectName}</p>
              <p className="text-[10px] text-neutral-500 truncate">
                {item.companyName} · {item.label}
              </p>
            </div>
            <span className={cn("font-mono shrink-0", amountClassName)}>
              {formatCurrency(item.amount)}
            </span>
          </>
        );

        return (
          <li key={item.dealId}>
            {onDealClick ? (
              <button
                type="button"
                onClick={() => onDealClick(item.dealId)}
                className="flex w-full items-start justify-between gap-3 rounded px-1 py-0.5 -mx-1 text-left hover:bg-neutral-800/80 transition-colors"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-start justify-between gap-3">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function InsightChartTooltip({
  active,
  label,
  forecast,
  netAfterSalary,
  deals,
  onDealClick,
}: {
  active?: boolean;
  label?: string | number;
  forecast: number;
  netAfterSalary: number;
  deals: FinanceDeal[];
  onDealClick?: (dealId: string) => void;
}) {
  if (!active || label == null) return null;

  const month = String(label);
  const monthTitle = new Date(`${month}-01`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const expectedBreakdown = expectedRevenueBreakdownForMonth(deals, month);
  const actualBreakdown = actualRevenueBreakdownForMonth(deals, month);
  const expected = expectedBreakdown.reduce((sum, item) => sum + item.amount, 0);
  const actual = actualBreakdown.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="w-72 rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-xs shadow-xl shadow-black/40">
      <p className="font-medium text-neutral-300 mb-3">{monthTitle}</p>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-neutral-400">Expected</span>
            <span className="font-mono font-semibold text-[#e8ff47]">{formatCurrency(expected)}</span>
          </div>
          {expectedBreakdown.length === 0 ? (
            <p className="text-neutral-600">No expected revenue</p>
          ) : (
            <BreakdownItems
              breakdown={expectedBreakdown}
              amountClassName="text-[#e8ff47]"
              onDealClick={onDealClick}
            />
          )}
        </div>

        <div className="border-t border-neutral-800" />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-neutral-400">Actual</span>
            <span className="font-mono font-semibold text-emerald-400">{formatCurrency(actual)}</span>
          </div>
          {actualBreakdown.length === 0 ? (
            <p className="text-neutral-600">No payments recorded</p>
          ) : (
            <BreakdownItems
              breakdown={actualBreakdown}
              amountClassName="text-emerald-400"
              onDealClick={onDealClick}
            />
          )}
        </div>

        <div className="border-t border-neutral-800 pt-2 space-y-1">
          <div className="flex items-center justify-between text-neutral-500">
            <span>Forecasted</span>
            <span className="font-mono text-violet-300">{formatCurrency(forecast)}</span>
          </div>
          <div className="flex items-center justify-between text-neutral-500">
            <span>Net after salary</span>
            <span className="font-mono text-orange-400">{formatCurrency(netAfterSalary)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FinanceOutlookChart({
  data,
  deals,
  onDealClick,
}: {
  data: InsightPoint[];
  deals: FinanceDeal[];
  onDealClick?: (dealId: string) => void;
}) {
  return (
    <div className="lg:col-span-3 border border-neutral-800 rounded-lg p-5 bg-neutral-900/40">
      <h2 className="text-sm font-medium text-neutral-300 mb-1">12-month revenue outlook</h2>
      <p className="text-xs text-neutral-600 mb-4">
        Expected vs actual revenue (incl. VAT) and net after €9k salary
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
          <XAxis
            dataKey="month"
            tick={{ fill: "#737373", fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
            axisLine={{ stroke: "#333" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#737373", fontSize: 11 }}
            tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <ReferenceLine y={0} stroke="#404040" strokeDasharray="3 3" />
          <Tooltip
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ pointerEvents: "auto", zIndex: 50 }}
            content={(props) => (
              <InsightChartTooltip
                active={props.active}
                label={props.label}
                forecast={Number(
                  props.payload?.find((entry) => entry.dataKey === "forecast")?.value ?? 0,
                )}
                netAfterSalary={Number(
                  props.payload?.find((entry) => entry.dataKey === "netAfterSalary")?.value ?? 0,
                )}
                deals={deals}
                onDealClick={onDealClick}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="expected"
            stroke="#e8ff47"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#e8ff47" }}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#34d399"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#34d399" }}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#a78bfa"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            activeDot={{ r: 4, fill: "#a78bfa" }}
          />
          <Line
            type="monotone"
            dataKey="netAfterSalary"
            stroke="#f97316"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4, fill: "#f97316" }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-6 mt-3">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-0.5 bg-violet-400 rounded"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #a78bfa 0 4px, transparent 4px 7px)",
            }}
          />
          <span className="text-xs text-neutral-500">Forecasted</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[#e8ff47] rounded" />
          <span className="text-xs text-neutral-500">Expected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-emerald-400 rounded" />
          <span className="text-xs text-neutral-500">Actual</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-0.5 bg-orange-500 rounded"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #f97316 0 3px, transparent 3px 6px)",
            }}
          />
          <span className="text-xs text-neutral-500">Net after salary</span>
        </div>
      </div>
    </div>
  );
}

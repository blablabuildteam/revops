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
  Opportunity,
  expectedRevenueBreakdownForMonth,
  actualRevenueBreakdownForMonth,
  forecastRevenueBreakdownForMonth,
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
  netAfterSalary,
  deals,
  opportunities,
  onDealClick,
}: {
  active?: boolean;
  label?: string | number;
  netAfterSalary: number;
  deals: FinanceDeal[];
  opportunities: Opportunity[];
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
  const forecastBreakdown = forecastRevenueBreakdownForMonth(opportunities, month);
  const expected = expectedBreakdown.reduce((sum, item) => sum + item.amount, 0);
  const actual = actualBreakdown.reduce((sum, item) => sum + item.amount, 0);
  const forecast = forecastBreakdown.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="w-72 rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-xs shadow-xl shadow-black/40">
      <p className="font-medium text-neutral-300 mb-3">{monthTitle}</p>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-neutral-400">Expected</span>
            <span className="font-mono font-semibold text-[#d4e052]">{formatCurrency(expected)}</span>
          </div>
          {expectedBreakdown.length === 0 ? (
            <p className="text-neutral-600">No expected revenue</p>
          ) : (
            <BreakdownItems
              breakdown={expectedBreakdown}
              amountClassName="text-[#d4e052]"
              onDealClick={onDealClick}
            />
          )}
        </div>

        <div className="border-t border-neutral-800" />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-neutral-400">Actual</span>
            <span className="font-mono font-semibold text-stone-300">{formatCurrency(actual)}</span>
          </div>
          {actualBreakdown.length === 0 ? (
            <p className="text-neutral-600">No payments recorded</p>
          ) : (
            <BreakdownItems
              breakdown={actualBreakdown}
              amountClassName="text-stone-300"
              onDealClick={onDealClick}
            />
          )}
        </div>

        <div className="border-t border-neutral-800" />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-neutral-400">Forecasted</span>
            <span className="font-mono font-semibold text-neutral-400">{formatCurrency(forecast)}</span>
          </div>
          {forecastBreakdown.length === 0 ? (
            <p className="text-neutral-600">No pipeline forecast</p>
          ) : (
            <BreakdownItems
              breakdown={forecastBreakdown}
              amountClassName="text-neutral-400"
            />
          )}
        </div>

        <div className="border-t border-neutral-800 pt-2">
          <div className="flex items-center justify-between text-neutral-500">
            <span>Net after salary</span>
            <span className="font-mono text-neutral-300">{formatCurrency(netAfterSalary)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FinanceOutlookChart({
  data,
  deals,
  opportunities,
  onDealClick,
}: {
  data: InsightPoint[];
  deals: FinanceDeal[];
  opportunities: Opportunity[];
  onDealClick?: (dealId: string) => void;
}) {
  return (
    <div className="lg:col-span-3 border border-neutral-800 rounded-lg p-5 bg-neutral-900/40">
      <h2 className="text-sm font-medium text-neutral-300 mb-1">12-month revenue outlook</h2>
      <p className="text-xs text-neutral-600 mb-4">
        Expected vs actual revenue (incl. VAT); net after salary uses excl. VAT
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
                netAfterSalary={Number(
                  props.payload?.find((entry) => entry.dataKey === "netAfterSalary")?.value ?? 0,
                )}
                deals={deals}
                opportunities={opportunities}
                onDealClick={onDealClick}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="expected"
            stroke="#d4e052"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#d4e052" }}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#a8a29e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#a8a29e" }}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#737373"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            activeDot={{ r: 4, fill: "#737373" }}
          />
          <Line
            type="monotone"
            dataKey="netAfterSalary"
            stroke="#78716c"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4, fill: "#78716c" }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-6 mt-3">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-0.5 bg-neutral-500 rounded"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #737373 0 4px, transparent 4px 7px)",
            }}
          />
          <span className="text-xs text-neutral-500">Forecasted</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[#d4e052] rounded" />
          <span className="text-xs text-neutral-500">Expected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-stone-400 rounded" />
          <span className="text-xs text-neutral-500">Actual</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-0.5 bg-stone-600 rounded"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #78716c 0 3px, transparent 3px 6px)",
            }}
          />
          <span className="text-xs text-neutral-500">Net after salary</span>
        </div>
      </div>
    </div>
  );
}

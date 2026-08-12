"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type { ComparisonPoint } from "@/lib/dutch-tax";

type TooltipPayload = { payload: ComparisonPoint }[];

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const bvWins = point.difference > 0;

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-xs shadow-xl shadow-black/40">
      <p className="font-medium text-neutral-300 mb-2">
        {formatCurrency(point.profit)} yearly profit
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="text-neutral-400">VOF net</span>
          <span className="font-mono text-[#d4e052]">{formatCurrency(point.vofNet)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-neutral-400">BV total</span>
          <span className="font-mono text-stone-400">{formatCurrency(point.bvNet)}</span>
        </div>
        {point.bvRetained > 0 && (
          <>
            <div className="flex items-center justify-between gap-6">
              <span className="text-neutral-500">· cash (salary)</span>
              <span className="font-mono text-neutral-400">{formatCurrency(point.bvCash)}</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-neutral-500">· left in BV</span>
              <span className="font-mono text-neutral-400">{formatCurrency(point.bvRetained)}</span>
            </div>
          </>
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-neutral-800 flex items-center justify-between gap-6">
        <span className="text-neutral-500">{bvWins ? "BV ahead" : "VOF ahead"}</span>
        <span
          className={`font-mono font-medium ${bvWins ? "text-stone-300" : "text-neutral-400"}`}
        >
          {formatCurrency(Math.abs(point.difference))}
        </span>
      </div>
    </div>
  );
}

export function BvComparisonChart({
  data,
  advantageFrom,
  advantageTo,
  currentProfit,
}: {
  data: ComparisonPoint[];
  advantageFrom: number | null;
  advantageTo: number | null;
  currentProfit: number;
}) {
  const maxProfit = data.length ? data[data.length - 1].profit : 0;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />

        {advantageFrom !== null && (
          <ReferenceArea
            x1={advantageFrom}
            x2={advantageTo ?? maxProfit}
            fill="#78716c"
            fillOpacity={0.08}
            stroke="#78716c"
            strokeOpacity={0.3}
            strokeDasharray="4 4"
          />
        )}

        <XAxis
          dataKey="profit"
          type="number"
          domain={[0, maxProfit]}
          tick={{ fill: "#737373", fontSize: 11 }}
          tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
          stroke="#404040"
        />
        <YAxis
          tick={{ fill: "#737373", fontSize: 11 }}
          tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
          stroke="#404040"
        />

        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#525252", strokeWidth: 1 }} />

        <Line
          dataKey="vofNet"
          name="VOF"
          stroke="#d4e052"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="bvNet"
          name="BV"
          stroke="#a8a29e"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />

        {currentProfit > 0 && currentProfit <= maxProfit && (
          <ReferenceLine
            x={currentProfit}
            stroke="#a8a29e"
            strokeDasharray="4 4"
            label={{
              value: "you",
              position: "top",
              fill: "#a8a29e",
              fontSize: 11,
            }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

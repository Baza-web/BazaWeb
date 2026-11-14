"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact } from "@/lib/utils";

type Row = { label: string; value: number; secondaryLabel?: string };

function ChartTooltip({
  active,
  payload,
  valueSuffix,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  valueSuffix?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-card">
      <p className="font-medium text-ink-900">{row.label}</p>
      <p className="text-stone-500">
        <span className="font-semibold text-ink-900">
          {row.value.toLocaleString()}
          {valueSuffix ?? ""}
        </span>
        {row.secondaryLabel ? ` · ${row.secondaryLabel}` : ""}
      </p>
    </div>
  );
}

export function RankedBarChart({
  data,
  valueSuffix,
  height = 220,
}: {
  data: Row[];
  valueSuffix?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-stone-400">No data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(height, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke="#e7e5e4" strokeDasharray="0" />
        <XAxis
          type="number"
          tickFormatter={(v) => formatCompact(v)}
          tick={{ fill: "#a8a29e", fontSize: 11 }}
          axisLine={{ stroke: "#d6d3d1" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={90}
          tick={{ fill: "#57534e", fontSize: 12 }}
          axisLine={{ stroke: "#d6d3d1" }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "#f5f5f4" }}
          content={<ChartTooltip valueSuffix={valueSuffix} />}
        />
        <Bar dataKey="value" fill="#c9801f" radius={[0, 4, 4, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

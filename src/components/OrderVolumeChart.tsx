"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { month: string; count: number };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-card">
      <p className="text-stone-500">{point.month}</p>
      <p className="font-semibold text-ink-900">
        {point.count} order{point.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function OrderVolumeChart({ data, height = 220 }: { data: Point[]; height?: number }) {
  const hasAny = data.some((d) => d.count > 0);
  if (!hasAny) {
    return <p className="py-8 text-center text-sm text-stone-400">No orders recorded in this period yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="orderVolumeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9801f" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#c9801f" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e7e5e4" />
        <XAxis dataKey="month" tick={{ fill: "#a8a29e", fontSize: 11 }} axisLine={{ stroke: "#d6d3d1" }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: "#a8a29e", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
        <Tooltip cursor={{ stroke: "#d6d3d1", strokeWidth: 1 }} content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#c9801f"
          strokeWidth={2}
          fill="url(#orderVolumeFill)"
          dot={false}
          activeDot={{ r: 4, fill: "#c9801f", stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

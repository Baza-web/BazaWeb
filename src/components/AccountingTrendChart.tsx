"use client";

import { ComposedChart, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { formatCompact, formatMoney } from "@/lib/utils";

type Point = { month: string; income: number; expense: number; profit: number };

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-card">
      <p className="mb-1 text-stone-500">{monthLabel(p.month)}</p>
      <p>
        Income <span className="font-semibold text-green-700">{formatMoney(p.income)}</span>
      </p>
      <p>
        Expense <span className="font-semibold text-red-700">{formatMoney(p.expense)}</span>
      </p>
      <p>
        Profit <span className="font-semibold text-ink-900">{formatMoney(p.profit)}</span>
      </p>
    </div>
  );
}

export function AccountingTrendChart({ data, height = 260 }: { data: Point[]; height?: number }) {
  const hasAny = data.some((d) => d.income > 0 || d.expense > 0);
  if (!hasAny) {
    return <p className="py-8 text-center text-sm text-stone-400">Not enough history yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="#e7e5e4" />
        <XAxis
          dataKey="month"
          tickFormatter={monthLabel}
          tick={{ fill: "#a8a29e", fontSize: 11 }}
          axisLine={{ stroke: "#d6d3d1" }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatCompact(v)}
          tick={{ fill: "#a8a29e", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="income" name="Income" stroke="#15803d" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="expense" name="Expense" stroke="#b91c1c" strokeWidth={2} dot={false} />
        <Line
          type="monotone"
          dataKey="profit"
          name="Profit"
          stroke="#c9801f"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

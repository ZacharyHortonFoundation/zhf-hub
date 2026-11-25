"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

const BRAND = ["#33506b", "#4e7599", "#7293b2", "#9db8d2", "#f5b83f", "#d99a1e", "#c6d6e6", "#94a3b8"];
const usd = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`);
const usdFull = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Monthly giving: this year vs last year (values in dollars). */
export function GivingTrendChart({ data }: { data: { month: string; current: number; previous: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="cur" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4e7599" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#4e7599" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#eef2f6" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
        <YAxis tickFormatter={usd} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} width={52} />
        <Tooltip formatter={(v) => usdFull(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="previous" name="Last year" stroke="#cbd5e1" strokeWidth={2} fill="transparent" strokeDasharray="4 4" />
        <Area type="monotone" dataKey="current" name="This year" stroke="#33506b" strokeWidth={2.5} fill="url(#cur)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, height = 240, money = true }: { data: { name: string; value: number }[]; height?: number; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#eef2f6" horizontal={false} />
        <XAxis type="number" tickFormatter={money ? usd : undefined} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
        <YAxis type="category" dataKey="name" width={150} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#334155" }} />
        <Tooltip formatter={(v) => (money ? usdFull(Number(v)) : String(v))} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} cursor={{ fill: "#f1f5f9" }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#4e7599" barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ColumnChart({ data, height = 240, money = true, color = "#4e7599" }: { data: { name: string; value: number }[]; height?: number; money?: boolean; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#eef2f6" vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} interval={0} />
        <YAxis tickFormatter={money ? usd : undefined} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} width={52} allowDecimals={false} />
        <Tooltip formatter={(v) => (money ? usdFull(Number(v)) : String(v))} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} cursor={{ fill: "#f1f5f9" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={color} barSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 220, money = false }: { data: { name: string; value: number }[]; height?: number; money?: boolean }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height={height > 180 ? 180 : height}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={BRAND[i % BRAND.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => (money ? usdFull(Number(v)) : String(v))} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: BRAND[i % BRAND.length] }} />
            <span className="flex-1 truncate text-slate-600">{d.name}</span>
            <span className="font-medium text-slate-900">{money ? usd(d.value) : d.value}</span>
            <span className="w-10 text-right text-xs text-slate-400">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export interface TrendPoint {
  label: string; // e.g. "Week of Jul 1" or "Jul 2026"
  percentage: number; // 0–100
}

/**
 * Generic attendance-percentage-over-time chart. Pure presentation —
 * the caller computes `data` from real attendance rows (see
 * CoordinatorDashboard's buildWeeklyTrend / StudentDashboard's personal
 * equivalent). No fake data is generated here or by callers.
 */
export default function AttendanceTrendChart({ data, height = 220 }: { data: TrendPoint[]; height?: number }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 text-center" style={{ height }}>
        <p className="text-sm font-medium text-ink-500">Not enough attendance data yet</p>
        <p className="text-xs text-ink-400">The trend line appears once check-ins accumulate.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {/* Gradient wash under the line. Both stops resolve through the
            theme's primary token, so the fill restains itself per theme
            instead of being a hardcoded blue. */}
        <defs>
          <linearGradient id="attendance-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--primary-500))" stopOpacity={0.32} />
            <stop offset="100%" stopColor="rgb(var(--primary-500))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--surface-line))" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgb(var(--ink-400))' }} axisLine={{ stroke: 'rgb(var(--surface-line))' }} tickLine={false} dy={4} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgb(var(--ink-400))' }} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          cursor={{ stroke: 'rgb(var(--primary-500))', strokeWidth: 1, strokeDasharray: '4 4' }}
          contentStyle={{
            background: 'rgb(var(--surface))',
            border: '1px solid rgb(var(--surface-line))',
            borderRadius: 14,
            fontSize: 12,
            boxShadow: '0 18px 44px -20px rgb(var(--shadow-rgb) / 0.35)',
            padding: '8px 12px',
          }}
          labelStyle={{ color: 'rgb(var(--ink-900))', fontWeight: 600, marginBottom: 2 }}
          itemStyle={{ color: 'rgb(var(--ink-700))' }}
          formatter={(value: number) => [`${value}%`, 'Attendance']}
        />
        {/* CHANGED: dot/activeDot now explicitly set fill+stroke to the same
            themed variable as the line itself, rather than relying on
            recharts' own default (which doesn't reliably inherit the line's
            color across recharts versions). Without this, the line could
            render themed while its own dots stayed an untheted default. */}
        <Area
          type="monotone"
          dataKey="percentage"
          stroke="rgb(var(--primary-500))"
          strokeWidth={2.5}
          fill="url(#attendance-trend-fill)"
          dot={{ r: 3, fill: 'rgb(var(--surface))', stroke: 'rgb(var(--primary-500))', strokeWidth: 2 }}
          activeDot={{ r: 5.5, fill: 'rgb(var(--primary-500))', stroke: 'rgb(var(--surface))', strokeWidth: 2.5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

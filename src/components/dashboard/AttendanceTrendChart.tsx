import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export interface TrendPoint {
  label: string; // e.g. "Week of Jul 1" or "Jul 2026"
  percentage: number; // 0–100
}

/**
 * Generic attendance-percentage-over-time line chart. Pure presentation —
 * the caller computes `data` from real attendance rows (see
 * CoordinatorDashboard's buildWeeklyTrend / StudentDashboard's personal
 * equivalent). No fake data is generated here or by callers.
 */
export default function AttendanceTrendChart({ data, height = 220 }: { data: TrendPoint[]; height?: number }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-ink-300" style={{ height }}>
        Not enough attendance data yet to show a trend.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--surface-line))" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgb(var(--ink-500))' }} axisLine={{ stroke: 'rgb(var(--surface-line))' }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'rgb(var(--ink-500))' }} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          cursor={{ stroke: 'rgb(var(--primary-300))', strokeWidth: 1 }}
          contentStyle={{
            background: 'rgb(var(--surface))',
            border: '1px solid rgb(var(--surface-line))',
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: 'rgb(var(--ink-900))' }}
          itemStyle={{ color: 'rgb(var(--ink-700))' }}
          formatter={(value: number) => [`${value}%`, 'Attendance']}
        />
        {/* CHANGED: dot/activeDot now explicitly set fill+stroke to the same
            themed variable as the line itself, rather than relying on
            recharts' own default (which doesn't reliably inherit the line's
            color across recharts versions). Without this, the line could
            render themed while its own dots stayed an untheted default. */}
        <Line
          type="monotone"
          dataKey="percentage"
          stroke="rgb(var(--primary-600))"
          strokeWidth={2.5}
          dot={{ r: 3, fill: 'rgb(var(--primary-600))', stroke: 'rgb(var(--primary-600))' }}
          activeDot={{ r: 5, fill: 'rgb(var(--primary-600))', stroke: 'rgb(var(--surface))', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
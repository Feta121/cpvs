export interface HospitalComplianceRow {
  hospitalId: string;
  name: string;
  percentage: number; // 0–100, computed from real attendance records
  totalRecords: number;
}

/**
 * Per-hospital attendance/compliance comparison. Pure presentation — the
 * caller computes `rows` from real attendance + hospital data.
 */
export default function HospitalComplianceBars({ rows }: { rows: HospitalComplianceRow[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-400">No hospital attendance data yet.</p>;
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => {
        // Gradient per band rather than a flat fill, so the bar itself reads
        // as a health signal at a glance. Tokens only — no hardcoded hex.
        const tone =
          r.percentage >= 85
            ? 'from-vital-400 to-vital-600'
            : r.percentage >= 65
              ? 'from-status-late to-status-verylate'
              : 'from-status-verylate to-status-expired';
        const glow =
          r.percentage >= 85
            ? 'shadow-[0_0_12px_-2px_rgb(var(--accent-500)/0.7)]'
            : r.percentage >= 65
              ? 'shadow-[0_0_12px_-2px_rgb(var(--warning)/0.7)]'
              : 'shadow-[0_0_12px_-2px_rgb(var(--danger)/0.7)]';
        return (
          <div key={r.hospitalId} className="group">
            <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-semibold tracking-[-0.01em] text-ink-900">{r.name}</span>
              <span className="shrink-0 tabular-nums font-semibold text-ink-700">
                {r.percentage}%
                <span className="ml-1.5 font-normal text-ink-400">({r.totalRecords} records)</span>
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted ring-1 ring-inset ring-surface-line">
              <div
                className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-spring ${tone} ${glow}`}
                style={{ width: `${Math.max(2, r.percentage)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

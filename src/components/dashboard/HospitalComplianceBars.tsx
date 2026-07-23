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
    return <p className="py-6 text-center text-sm text-ink-300">No hospital attendance data yet.</p>;
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => {
        const tone = r.percentage >= 85 ? 'bg-vital-500' : r.percentage >= 65 ? 'bg-status-late' : 'bg-status-expired';
        return (
          <div key={r.hospitalId}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-ink-900">{r.name}</span>
              <span className="text-ink-500">{r.percentage}% <span className="text-ink-300">({r.totalRecords} records)</span></span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className={`h-full rounded-full transition-all duration-500 ${tone}`}
                style={{ width: `${Math.max(2, r.percentage)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

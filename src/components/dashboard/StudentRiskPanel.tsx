import { ShieldCheck } from 'lucide-react';
import Badge from '../ui/Badge';

export type RiskSeverity = 'high' | 'medium' | 'low';

export interface RiskEntry {
  studentId: string;
  studentName: string;
  severity: RiskSeverity;
  reasons: string[]; // e.g. "Attendance 58%", "3 late check-ins", "2 missing check-outs"
}

const severityTone: Record<RiskSeverity, 'expired' | 'verylate' | 'late'> = {
  high: 'expired',
  medium: 'verylate',
  low: 'late',
};

/** Leading-edge rail color per severity — presentation only. */
const severityRail: Record<RiskSeverity, string> = {
  high: 'bg-gradient-to-b from-status-expired to-status-verylate',
  medium: 'bg-gradient-to-b from-status-verylate to-status-late',
  low: 'bg-gradient-to-b from-status-late to-status-late/40',
};

/**
 * Flags students who may need coordinator attention. Pure presentation —
 * the caller (CoordinatorDashboard) computes `entries` from real attendance,
 * appeal, and student records using the thresholds documented there.
 */
export default function StudentRiskPanel({ entries }: { entries: RiskEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <div className="icon-tile-accent h-12 w-12 rounded-xl3">
          <ShieldCheck size={22} strokeWidth={2.25} />
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-ink-500">No students currently flagged — everyone's tracking well.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {entries.map((e) => (
        <div
          key={e.studentId}
          className="group relative flex items-start justify-between gap-3 overflow-hidden rounded-xl2 border border-surface-line bg-surface-alt/40 p-3.5 pl-4 transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:border-transparent hover:bg-surface hover:shadow-lift"
        >
          {/* Severity rail on the leading edge — the row is scannable by
              color before the badge is even read. */}
          <span className={`absolute inset-y-0 left-0 w-1 ${severityRail[e.severity]}`} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[-0.01em] text-ink-900">{e.studentName}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">{e.reasons.join(' · ')}</p>
          </div>
          <Badge tone={severityTone[e.severity]}>{e.severity}</Badge>
        </div>
      ))}
    </div>
  );
}

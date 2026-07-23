import { AlertTriangle } from 'lucide-react';
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

/**
 * Flags students who may need coordinator attention. Pure presentation —
 * the caller (CoordinatorDashboard) computes `entries` from real attendance,
 * appeal, and student records using the thresholds documented there.
 */
export default function StudentRiskPanel({ entries }: { entries: RiskEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-vital-50 text-vital-600">
          <AlertTriangle size={18} />
        </div>
        <p className="text-sm text-ink-500">No students currently flagged — everyone's tracking well.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {entries.map((e) => (
        <div key={e.studentId} className="flex items-start justify-between gap-3 rounded-xl border border-surface-line p-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900">{e.studentName}</p>
            <p className="mt-0.5 text-xs text-ink-500">{e.reasons.join(' · ')}</p>
          </div>
          <Badge tone={severityTone[e.severity]}>{e.severity}</Badge>
        </div>
      ))}
    </div>
  );
}

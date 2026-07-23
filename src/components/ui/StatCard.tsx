import { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'clinical',
  hint,
  to,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'clinical' | 'vital' | 'late' | 'verylate' | 'expired';
  hint?: string;
  /** Optional route — when set, the whole card becomes a clickable link. */
  to?: string;
}) {
  const toneMap: Record<string, string> = {
    clinical: 'bg-clinical-50 text-clinical-600',
    vital: 'bg-vital-50 text-vital-600',
    late: 'bg-status-late/10 text-status-late',
    verylate: 'bg-status-verylate/10 text-status-verylate',
    expired: 'bg-status-expired/10 text-status-expired',
  };

  const content = (
    <div className={clsx('glass-card p-5 animate-fadeUp', to && 'transition-shadow hover:shadow-card cursor-pointer')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
          <p className="mt-2 font-display text-3xl font-semibold text-ink-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
        </div>
        <div className={clsx('rounded-xl p-2.5', toneMap[tone])}>
          <Icon size={20} strokeWidth={2.25} />
        </div>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

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
  /* Each tone now drives three layers instead of one flat icon chip: the icon
     color, a gradient tile the icon sits in, an accent rail along the card's
     top edge, and a soft corner bloom. That's what gives the tile a light
     source and lets the status color register at a glance from across a
     dashboard grid without shouting. */
  const iconColor: Record<string, string> = {
    clinical: 'text-clinical-600',
    vital: 'text-vital-600',
    late: 'text-status-late',
    verylate: 'text-status-verylate',
    expired: 'text-status-expired',
  };

  const tile: Record<string, string> = {
    clinical: 'from-clinical-500/22 to-vital-500/10 ring-clinical-500/25',
    vital: 'from-vital-500/22 to-clinical-500/10 ring-vital-500/25',
    late: 'from-status-late/25 to-status-late/5 ring-status-late/25',
    verylate: 'from-status-verylate/25 to-status-verylate/5 ring-status-verylate/25',
    expired: 'from-status-expired/25 to-status-expired/5 ring-status-expired/25',
  };

  const rail: Record<string, string> = {
    clinical: 'from-clinical-500 via-vital-500 to-clinical-400',
    vital: 'from-vital-500 via-clinical-500 to-vital-400',
    late: 'from-status-late via-status-verylate to-status-late',
    verylate: 'from-status-verylate via-status-expired to-status-verylate',
    expired: 'from-status-expired via-status-verylate to-status-expired',
  };

  const bloom: Record<string, string> = {
    clinical: 'bg-clinical-500/25',
    vital: 'bg-vital-500/25',
    late: 'bg-status-late/25',
    verylate: 'bg-status-verylate/25',
    expired: 'bg-status-expired/25',
  };

  const content = (
    <div className={clsx('glass-card group relative overflow-hidden p-5 animate-fadeUp', to && 'card-hover cursor-pointer')}>
      <span className={clsx('absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r', rail[tone])} />
      <span
        className={clsx(
          'pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-70 blur-2xl transition-opacity duration-500 group-hover:opacity-100',
          bloom[tone],
        )}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="section-label">{label}</p>
          <p className="stat-value mt-2.5 text-[2rem] leading-none text-ink-900">{value}</p>
          {hint && <p className="mt-2 text-xs text-ink-500">{hint}</p>}
        </div>
        <div
          className={clsx(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl2 bg-gradient-to-br ring-1 ring-inset transition-transform duration-300 ease-spring group-hover:scale-105',
            tile[tone],
            iconColor[tone],
          )}
        >
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

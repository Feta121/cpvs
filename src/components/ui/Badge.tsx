import { ReactNode } from 'react';
import clsx from 'clsx';

export default function Badge({
  children,
  tone = 'neutral',
  dot = false,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'present' | 'late' | 'verylate' | 'expired' | 'clinical' | 'vital';
  dot?: boolean;
}) {
  const toneMap: Record<string, string> = {
    neutral: 'bg-ink-300/10 text-ink-500',
    present: 'bg-status-present/10 text-status-present',
    late: 'bg-status-late/10 text-status-late',
    verylate: 'bg-status-verylate/10 text-status-verylate',
    expired: 'bg-status-expired/10 text-status-expired',
    clinical: 'bg-clinical-100 text-clinical-700',
    vital: 'bg-vital-100 text-vital-700',
  };
  const dotMap: Record<string, string> = {
    neutral: 'bg-ink-300',
    present: 'bg-status-present',
    late: 'bg-status-late',
    verylate: 'bg-status-verylate',
    expired: 'bg-status-expired',
    clinical: 'bg-clinical-500',
    vital: 'bg-vital-500',
  };

  return (
    <span className={clsx('badge', toneMap[tone])}>
      {dot && <span className={clsx('status-dot', dotMap[tone])} />}
      {children}
    </span>
  );
}

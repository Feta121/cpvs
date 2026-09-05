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
  /* Each tone carries a tinted fill AND a same-hue inset ring. The ring is
     what makes a badge read as a discrete object on a card rather than a
     smudge of color behind text — and because it's an inset ring it costs no
     layout, so badges still line up on the same baseline as adjacent text.
     The ring's box-shadow intentionally supersedes .badge's neutral hairline. */
  const toneMap: Record<string, string> = {
    neutral: 'bg-ink-300/12 text-ink-600 ring-1 ring-inset ring-ink-300/30',
    present: 'bg-status-present/12 text-status-present ring-1 ring-inset ring-status-present/30',
    late: 'bg-status-late/12 text-status-late ring-1 ring-inset ring-status-late/30',
    verylate: 'bg-status-verylate/12 text-status-verylate ring-1 ring-inset ring-status-verylate/30',
    expired: 'bg-status-expired/12 text-status-expired ring-1 ring-inset ring-status-expired/30',
    clinical: 'bg-clinical-500/12 text-clinical-700 ring-1 ring-inset ring-clinical-500/28',
    vital: 'bg-vital-500/14 text-vital-700 ring-1 ring-inset ring-vital-500/28',
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

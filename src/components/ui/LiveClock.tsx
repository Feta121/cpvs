import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { format } from 'date-fns';

/**
 * Live date/time row, ticking every second (down to the second, per request
 * — not just minute-level). Uses the browser's local clock via `new Date()`
 * and setInterval, so it reflects whatever timezone the coordinator/student
 * is actually sitting in, not the server's.
 */
export default function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="inline-flex flex-wrap items-center gap-2.5 rounded-full border border-surface-line bg-surface/70 px-3.5 py-2 text-sm font-medium text-ink-600 shadow-card backdrop-blur-md">
      <span className="icon-tile h-6 w-6 rounded-lg">
        <Clock size={13} strokeWidth={2.5} />
      </span>
      <span>{format(now, 'EEEE, MMMM d, yyyy')}</span>
      <span className="h-1 w-1 rounded-full bg-ink-300" />
      {/* tabular-nums keeps digit widths fixed so the seconds ticking over
          doesn't cause the surrounding text to jitter/reflow every second. */}
      <span className="tabular-nums font-semibold text-ink-900">{format(now, 'hh:mm:ss a')}</span>
    </div>
  );
}

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
    // Was a single `flex-wrap` row including the "•" separator as a flex
    // child — on a narrow phone screen the full date ("Saturday, September
    // 5, 2026") plus the time didn't fit one line, so it wrapped, and the
    // bare dot ended up stranded alone at the start of the second line
    // rather than acting as a separator. Below `sm`, this now lays out as
    // two clean rows (icon+date, then time) with no dot; at `sm` and up it's
    // the original single-line pill with the dot back as a separator.
    <div className="inline-flex flex-col items-start gap-1 rounded-2xl border border-surface-line bg-surface/70 px-3.5 py-2.5 text-sm font-medium text-ink-600 shadow-card backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5 sm:rounded-full sm:py-2">
      <span className="flex items-center gap-2.5">
        <span className="icon-tile h-6 w-6 shrink-0 rounded-lg">
          <Clock size={13} strokeWidth={2.5} />
        </span>
        <span>{format(now, 'EEEE, MMMM d, yyyy')}</span>
      </span>
      <span className="hidden h-1 w-1 shrink-0 rounded-full bg-ink-300 sm:block" />
      {/* tabular-nums keeps digit widths fixed so the seconds ticking over
          doesn't cause the surrounding text to jitter/reflow every second. */}
      <span className="tabular-nums font-semibold text-ink-900 pl-[34px] sm:pl-0">{format(now, 'hh:mm:ss a')}</span>
    </div>
  );
}

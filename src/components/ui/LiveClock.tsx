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
    // User feedback: no card/box on mobile, single row on both. Below `sm`
    // this is now bare icon + text (no border/background/shadow/padding),
    // and the date uses a shorter format there ("Sat, Sep 5, 2026" instead
    // of "Saturday, September 5, 2026") so the whole thing — icon, date,
    // separator, time — actually fits one line on a phone instead of
    // needing to wrap. At `sm` and up this is unchanged from before: the
    // original bordered pill with the full date.
    <div className="inline-flex items-center gap-2 text-sm font-medium text-ink-600 sm:gap-2.5 sm:rounded-full sm:border sm:border-surface-line sm:bg-surface/70 sm:px-3.5 sm:py-2 sm:shadow-card sm:backdrop-blur-md">
      <span className="icon-tile h-6 w-6 shrink-0 rounded-lg">
        <Clock size={13} strokeWidth={2.5} />
      </span>
      <span className="sm:hidden">{format(now, 'EEE, MMM d, yyyy')}</span>
      <span className="hidden sm:inline">{format(now, 'EEEE, MMMM d, yyyy')}</span>
      <span className="h-1 w-1 shrink-0 rounded-full bg-ink-300" />
      {/* tabular-nums keeps digit widths fixed so the seconds ticking over
          doesn't cause the surrounding text to jitter/reflow every second. */}
      <span className="tabular-nums font-semibold text-ink-900">{format(now, 'hh:mm:ss a')}</span>
    </div>
  );
}

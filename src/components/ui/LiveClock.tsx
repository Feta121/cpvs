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
    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-600">
      <Clock size={15} className="text-clinical-600" />
      <span>{format(now, 'EEEE, MMMM d, yyyy')}</span>
      <span className="text-ink-400">·</span>
      {/* tabular-nums keeps digit widths fixed so the seconds ticking over
          doesn't cause the surrounding text to jitter/reflow every second. */}
      <span className="tabular-nums">{format(now, 'hh:mm:ss a')}</span>
    </div>
  );
}

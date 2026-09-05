import { useEffect, useState } from 'react';
import { Bell, Megaphone, CalendarClock, FileWarning, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { groupByDayLabel } from '../../utils/groupByDay';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { NotificationRow } from '../../types/database';

const iconMap = {
  attendance_warning: AlertTriangle,
  appeal_result: FileWarning,
  rotation_update: CalendarClock,
  announcement: Megaphone,
  late_concern: AlertTriangle,
};

/** Purely presentational tint per notification type — keyed off the same
 * `n.type` the icon map already uses, so the two can't drift apart. */
const toneMap: Record<keyof typeof iconMap, string> = {
  attendance_warning: 'bg-status-verylate/12 text-status-verylate ring-status-verylate/25',
  appeal_result: 'bg-vital-500/12 text-vital-600 ring-vital-500/25',
  rotation_update: 'bg-clinical-500/12 text-clinical-600 ring-clinical-500/25',
  announcement: 'bg-clinical-500/12 text-clinical-600 ring-clinical-500/25',
  late_concern: 'bg-status-late/12 text-status-late ring-status-late/25',
};

export default function StudentNotifications() {
  const { profile } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      setItems(data ?? []);
      setLoading(false);

      const unreadIds = (data ?? []).filter((n) => !n.is_read).map((n) => n.id);
      if (unreadIds.length > 0) {
        await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
      }
    })();
  }, [profile]);

  if (loading) return <FullScreenLoader label="Loading notifications…" />;

  const grouped = groupByDayLabel(items, (n) => n.created_at);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tightest text-ink-900">Notifications</h1>
        <p className="mt-1 text-sm text-ink-500">Attendance warnings, appeal results, and announcements.</p>
      </div>

      {items.length === 0 && (
        <div className="surface-card p-10 text-center">
          <div className="icon-tile mx-auto mb-4 h-14 w-14 rounded-xl3">
            <Bell size={24} strokeWidth={2.25} />
          </div>
          <p className="font-display text-lg font-semibold tracking-[-0.01em] text-ink-900">You're all caught up.</p>
          <p className="mt-1 text-sm text-ink-500">New notifications will appear here.</p>
        </div>
      )}

      {grouped.map(([dayLabel, dayItems]) => (
        <div key={dayLabel} className="space-y-2.5">
          <p className="section-label flex items-center gap-2.5 px-1">
            {dayLabel}
            <span className="hairline flex-1" />
          </p>
          <div className="surface-card divide-y divide-surface-line overflow-hidden">
            {dayItems.map((n) => {
              const Icon = iconMap[n.type];
              return (
                <div
                  key={n.id}
                  className={`relative flex gap-3.5 p-4 transition-colors duration-300 hover:bg-surface-muted/60 ${
                    !n.is_read ? 'bg-clinical-500/[0.05]' : ''
                  }`}
                >
                  {!n.is_read && <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-clinical-500 to-vital-500" />}
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${toneMap[n.type]}`}>
                    <Icon size={16} strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                      {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-clinical-500" />}
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-500">{n.message}</p>
                    <p className="mt-1.5 text-2xs font-medium uppercase tracking-wider tabular-nums text-ink-400">{new Date(n.created_at).toLocaleTimeString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

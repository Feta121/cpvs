import { useEffect, useState } from 'react';
import { Bell, Megaphone, CalendarClock, FileWarning, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { NotificationRow } from '../../types/database';

const iconMap = {
  attendance_warning: AlertTriangle,
  appeal_result: FileWarning,
  rotation_update: CalendarClock,
  announcement: Megaphone,
  late_concern: AlertTriangle,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Notifications</h1>
        <p className="mt-1 text-sm text-ink-500">Attendance warnings, appeal results, and announcements.</p>
      </div>

      <div className="surface-card divide-y divide-surface-line">
        {items.length === 0 && (
          <div className="p-8 text-center text-sm text-ink-500">
            <Bell className="mx-auto mb-2 text-ink-300" size={24} />
            You're all caught up.
          </div>
        )}
        {items.map((n) => {
          const Icon = iconMap[n.type];
          return (
            <div key={n.id} className={`flex gap-3 p-4 ${!n.is_read ? 'bg-clinical-50/40' : ''}`}>
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-clinical-50 text-clinical-600">
                <Icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">{n.title}</p>
                <p className="mt-0.5 text-sm text-ink-500">{n.message}</p>
                <p className="mt-1 text-xs text-ink-300">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

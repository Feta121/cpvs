import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { registerServiceWorker, showBrowserNotification } from '../../utils/pushNotifications';
import { notificationTypeToPath } from '../../utils/notificationRouting';
import type { NotificationRow } from '../../types/database';

/**
 * Renders nothing — this is pure side effects, mounted once inside AppShell
 * so it's alive for the whole authenticated session regardless of which
 * page is showing.
 *
 * Behavior matches Gmail/WhatsApp Web/Discord: while the tab is the visible,
 * focused one, the in-app bell + toast are enough — an OS notification only
 * fires when the tab is hidden (another tab, or minimized), so the user
 * doesn't get double-notified for something they're already looking at.
 */
export default function PushNotificationManager() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (!profile) return;

    // Same defensive guard as AppShell's notification badge channel — see
    // the comment there for why this is needed (StrictMode double-invoke /
    // async removeChannel not resolved before a rapid re-run).
    const topic = `notifications-push-${profile.id}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const n = payload.new as NotificationRow;
          if (document.visibilityState !== 'visible') {
            const path = notificationTypeToPath(n.type, profile.role);
            showBrowserNotification(n.title, n.message, path);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // The service worker posts this message (from its notificationclick
  // handler) when the user clicks a notification and this tab already has
  // focus — navigate via the app's own router instead of a full reload.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'notification-click' && typeof event.data.url === 'string') {
        navigate(event.data.url);
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
  }, [navigate]);

  return null;
}

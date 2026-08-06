export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('[CPVS] Service worker registration failed:', err);
    return null;
  }
}

export type NotificationSupport = 'unsupported' | NotificationPermission;

export function getNotificationPermission(): NotificationSupport {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (!('Notification' in window)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Shows a real OS/browser notification via the service worker (preferred —
 * supports the `data.url` payload the service worker's notificationclick
 * handler reads) with a graceful fallback to the plain Notification
 * constructor if no service worker is available.
 */
export async function showBrowserNotification(title: string, body: string, url: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: '/favicon-64.png',
        badge: '/favicon-64.png',
        data: { url },
        tag: url, // collapses rapid duplicate notifications pointing at the same page
      });
      return;
    } catch (err) {
      console.warn('[CPVS] showNotification via service worker failed, falling back:', err);
    }
  }

  new Notification(title, { body, icon: '/favicon-64.png' });
}

/** Feature-detected app icon badge (Badging API) — silently no-ops in
 * browsers/contexts that don't support it (most non-installed tabs). */
export function setAppBadgeCount(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (count > 0) {
    nav.setAppBadge?.(count).catch(() => {});
  } else {
    nav.clearAppBadge?.().catch(() => {});
  }
}

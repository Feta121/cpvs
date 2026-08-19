import { useCallback, useEffect, useState } from 'react';

/** Chrome/Android fire this event once their own installability checks
 * pass (HTTPS + manifest + registered service worker) instead of showing
 * their own mini-infobar automatically — capturing it lets us trigger the
 * real native install flow from our own button instead. TypeScript doesn't
 * ship a type for this event since it isn't in any web standard yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's older, non-standard flag for the same thing.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

/**
 * Centralizes the browser-install-prompt dance so it isn't duplicated
 * between the floating <InstallPrompt> banner and the Settings page's
 * "Install app" row. Each consumer gets its own listener (harmless — both
 * receive the same underlying event, and only one will realistically call
 * `install()` in a given session).
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const standalone = isStandalone();

  useEffect(() => {
    if (standalone) return; // already installed — nothing to capture

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable' as const;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null); // a captured prompt event can only be used once
    return outcome;
  }, [deferredPrompt]);

  return {
    /** True once Chrome/Android has signaled the app is installable and
     * we're holding a live prompt event ready to trigger. */
    canInstall: !!deferredPrompt,
    /** True on iOS, where there's no install API at all — callers should
     * show manual "Add to Home Screen" instructions instead of a button. */
    isIOS: isIOS(),
    /** True if already running as an installed app. */
    isStandalone: standalone,
    install,
  };
}

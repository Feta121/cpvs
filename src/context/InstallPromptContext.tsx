import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

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

interface InstallPromptValue {
  canInstall: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

const InstallPromptContext = createContext<InstallPromptValue | null>(null);

/**
 * Mounted exactly once, at the app root (see main.tsx) — this is the whole
 * point. `beforeinstallprompt` fires at most once per page load, so
 * whichever listener happens to be mounted at that moment is the only one
 * that will ever see it. Previously, both the floating banner and the
 * Settings page ran their own independent copy of this logic (each with
 * its own `useState` + its own listener), so whichever one happened to be
 * mounted first "won" the event and the other was permanently stuck
 * showing "not available" — not because installability actually failed,
 * but because it was listening for an event that had already come and
 * gone. Making this a single Provider with one listener, consumed via
 * context, means every consumer sees the same state.
 */
export function InstallPromptProvider({ children }: { children: ReactNode }) {
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

  const value: InstallPromptValue = {
    canInstall: !!deferredPrompt,
    isIOS: isIOS(),
    isStandalone: standalone,
    install,
  };

  return <InstallPromptContext.Provider value={value}>{children}</InstallPromptContext.Provider>;
}

export function useInstallPrompt() {
  const ctx = useContext(InstallPromptContext);
  if (!ctx) throw new Error('useInstallPrompt must be used within InstallPromptProvider');
  return ctx;
}

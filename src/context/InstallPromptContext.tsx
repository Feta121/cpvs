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

/**
 * Manual, always-available fallback for when there's no captured
 * `beforeinstallprompt` to trigger — either because this browser doesn't
 * support that API at all (Firefox, desktop Safari), or because Chrome's
 * own engagement heuristic hasn't been satisfied yet for this visitor. No
 * website can force either of those from the outside, so instead of a
 * dead-end "not available" message, every real browser gets its own real
 * set of manual steps — nobody sees a message with nothing they can do
 * about it.
 */
export function getInstallInstructions(): { steps: string[]; unsupported?: boolean } {
  const ua = navigator.userAgent;
  const ios = isIOS();
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
  const isFirefox = /Firefox|FxiOS/.test(ua);
  const isEdge = /Edg\//.test(ua);
  const isChromium = /Chrome|CriOS/.test(ua) || isEdge || /SamsungBrowser/.test(ua);

  if (ios) {
    if (isSafari) return { steps: ['Tap the Share icon in the toolbar', 'Scroll down and tap "Add to Home Screen"'] };
    // Only Safari can install on iOS — every other iOS browser (Chrome,
    // Firefox, etc.) is a WebKit wrapper without that capability at all,
    // no matter what we do in JS.
    return { steps: ['Open this page in Safari — other iOS browsers can\'t install apps to your home screen'], unsupported: true };
  }

  if (isChromium) {
    // Covers Android Chrome/Edge/Samsung Internet before the automatic
    // prompt has fired, and desktop Chrome/Edge.
    return {
      steps: [
        'Open your browser\'s menu (⋮ or ≡ in the top corner)',
        'Look for "Install app" or "Add to Home screen"',
      ],
    };
  }

  if (isFirefox) {
    return { steps: ['Firefox doesn\'t support installing this as an app yet — try Chrome or Edge instead'], unsupported: true };
  }

  // Desktop Safari, or anything unrecognized.
  return { steps: ['Look for an "Install" or "Add to Home Screen" option in your browser\'s menu'] };
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
 *
 * That fixed "two React listeners racing each other", but there's a
 * second, earlier race: `beforeinstallprompt` can fire before React has
 * even finished loading and hydrating, in which case a listener attached
 * inside a useEffect here misses it no matter how early it runs. index.html
 * has a plain <script> in <head> — the earliest point anything can run on
 * the page — that captures the event onto `window.__cpvsInstallPrompt`
 * before our bundle has even started downloading. This effect below reads
 * that pre-captured value on mount (covers "fired before React existed")
 * and also listens for it live (covers "fires normally, after mount").
 */
export function InstallPromptProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => (window as unknown as { __cpvsInstallPrompt?: BeforeInstallPromptEvent }).__cpvsInstallPrompt ?? null
  );
  const standalone = isStandalone();

  useEffect(() => {
    if (standalone) return; // already installed — nothing to capture

    function readCaptured() {
      const captured = (window as unknown as { __cpvsInstallPrompt?: BeforeInstallPromptEvent }).__cpvsInstallPrompt;
      if (captured) setDeferredPrompt(captured);
    }

    // Covers the event having fired between the inline <script> in
    // index.html running and this effect subscribing.
    readCaptured();
    // Covers the event firing after this effect has subscribed — the
    // inline script's own listener still does the actual capturing (it
    // was first), this just tells us to go re-read what it stored.
    window.addEventListener('cpvs:installpromptready', readCaptured);
    return () => window.removeEventListener('cpvs:installpromptready', readCaptured);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable' as const;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null); // a captured prompt event can only be used once
    (window as unknown as { __cpvsInstallPrompt?: BeforeInstallPromptEvent | null }).__cpvsInstallPrompt = null;
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

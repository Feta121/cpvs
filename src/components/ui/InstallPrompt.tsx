import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const DISMISSED_KEY = 'cpvs-install-prompt-dismissed';

/** Chrome/Android fire this event once their own installability checks
 * pass (HTTPS + manifest + registered service worker) instead of showing
 * their own mini-infobar automatically — capturing it lets us trigger the
 * real native install flow from our own button instead. TypeScript doesn't
 * ship a type for this event since it isn't in any web standard yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's older, non-standard flag for the same thing.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

/** Mounted once at the app root (see App.tsx) so it's available on every
 * route, including Login — someone shouldn't have to log in first just to
 * see the option to install the app. */
export default function InstallPrompt() {
  const { showSuccess } = useToast();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');

  useEffect(() => {
    if (isStandalone()) return; // already installed/running as an app — nothing to offer

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault(); // stops Chrome's own mini-infobar so our button is the only prompt
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // iOS never fires beforeinstallprompt at all — Safari has no install
    // API — so this is the only signal we can act on for it.
    if (isIOS()) setShowIOSHint(true);

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null); // a captured prompt event can only be used once
    if (outcome === 'accepted') showSuccess('CPVS installed');
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  if (dismissed || isStandalone()) return null;
  if (!deferredPrompt && !showIOSHint) return null;

  return (
    <div className="animate-fadeUp fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md sm:inset-x-auto sm:right-4">
      <div className="surface-card flex items-start gap-3 p-4 shadow-lift">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clinical-600 text-onPrimary">
          {deferredPrompt ? <Download size={18} /> : <Share size={18} />}
        </div>
        <div className="flex-1 text-sm">
          <p className="font-medium text-ink-900">Install CPVS</p>
          {deferredPrompt ? (
            <p className="mt-0.5 text-ink-500">Add it to your home screen for quick, full-screen access.</p>
          ) : (
            <p className="mt-0.5 text-ink-500">
              Tap <Share size={12} className="mb-0.5 inline" /> Share, then "Add to Home Screen".
            </p>
          )}
          {deferredPrompt && (
            <button onClick={handleInstallClick} className="btn-primary mt-3 px-3 py-1.5 text-xs">
              Install
            </button>
          )}
        </div>
        <button onClick={dismiss} className="shrink-0 rounded-lg p-1 text-ink-300 hover:bg-surface-muted hover:text-ink-700" aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

const DISMISSED_KEY = 'cpvs-install-prompt-dismissed';

/** Mounted once at the app root (see App.tsx) so it's available on every
 * route, including Login — someone shouldn't have to log in first just to
 * see the option to install the app. Install/update logic itself lives in
 * useInstallPrompt so it's shared with the Settings page's install row. */
export default function InstallPrompt() {
  const { showSuccess } = useToast();
  const { canInstall, isIOS, isStandalone, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');

  async function handleInstallClick() {
    const outcome = await install();
    if (outcome === 'accepted') showSuccess('CPVS installed');
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  if (dismissed || isStandalone) return null;
  if (!canInstall && !isIOS) return null;

  return (
    <div className="animate-fadeUp fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md sm:inset-x-auto sm:right-4">
      <div className="glass-card relative flex items-start gap-3.5 overflow-hidden p-4 shadow-float">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-clinical-500 via-vital-500 to-clinical-400" />
        <span className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-clinical-500/14 blur-3xl" />

        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl2 bg-gradient-to-br from-clinical-500 to-clinical-600 text-onPrimary shadow-glow">
          {canInstall ? <Download size={19} strokeWidth={2.25} /> : <Share size={19} strokeWidth={2.25} />}
        </div>
        <div className="relative flex-1 text-sm">
          <p className="font-display font-semibold tracking-[-0.01em] text-ink-900">Install CPVS</p>
          {canInstall ? (
            <p className="mt-1 text-xs leading-relaxed text-ink-500">Add it to your home screen for quick, full-screen access.</p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Tap <Share size={12} className="mb-0.5 inline" /> Share, then "Add to Home Screen".
            </p>
          )}
          {canInstall && (
            <button onClick={handleInstallClick} className="btn-primary mt-3.5 px-3.5 py-1.5 text-xs">
              Install
            </button>
          )}
        </div>
        <button onClick={dismiss} className="btn-icon relative h-7 w-7 shrink-0" aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

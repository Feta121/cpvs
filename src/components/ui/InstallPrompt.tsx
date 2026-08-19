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
      <div className="surface-card flex items-start gap-3 p-4 shadow-lift">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clinical-600 text-onPrimary">
          {canInstall ? <Download size={18} /> : <Share size={18} />}
        </div>
        <div className="flex-1 text-sm">
          <p className="font-medium text-ink-900">Install CPVS</p>
          {canInstall ? (
            <p className="mt-0.5 text-ink-500">Add it to your home screen for quick, full-screen access.</p>
          ) : (
            <p className="mt-0.5 text-ink-500">
              Tap <Share size={12} className="mb-0.5 inline" /> Share, then "Add to Home Screen".
            </p>
          )}
          {canInstall && (
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

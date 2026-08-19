import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Sparkles, Download, Share, RefreshCw, CheckCircle2, KeyRound, Bell, BellOff, Info, type LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemePreference } from '../theme/ThemeProvider';
import { useToast } from '../context/ToastContext';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { getNotificationPermission, requestNotificationPermission } from '../utils/pushNotifications';

const THEME_OPTIONS: { value: ThemePreference; icon: LucideIcon; label: string; blurb: string }[] = [
  { value: 'light', icon: Sun, label: 'Light', blurb: 'Bright, high-contrast' },
  { value: 'dark', icon: Moon, label: 'Dark', blurb: 'Easier on the eyes at night' },
  { value: 'aether', icon: Sparkles, label: 'Aether', blurb: 'Dark with a lime accent' },
];

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="surface-card p-6">
      <h2 className="font-display text-base font-semibold text-ink-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Covers both halves of the request: on the website (or before install)
 * this shows the same install flow as the floating banner; once actually
 * running as an installed app (isStandalone), there's nothing to "install"
 * anymore, so it switches to a manual "check for updates" action instead. */
function InstallOrUpdateRow() {
  const { showSuccess, showError } = useToast();
  const { canInstall, isIOS, isStandalone, install } = useInstallPrompt();
  const [checking, setChecking] = useState(false);

  async function handleInstall() {
    const outcome = await install();
    if (outcome === 'accepted') showSuccess('CPVS installed');
    else if (outcome === 'dismissed') showError('Install dismissed.');
  }

  async function handleCheckForUpdates() {
    setChecking(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
      showSuccess('Reloading to apply the latest version…');
      // This service worker calls skipWaiting() unconditionally on
      // install (see public/sw.js), so a reload right after update() is
      // enough to guarantee fresh assets — no need for a "new version
      // waiting" banner/controllerchange dance.
      setTimeout(() => window.location.reload(), 600);
    } catch {
      showError('Could not check for updates — check your connection and try again.');
      setChecking(false);
    }
  }

  if (isStandalone) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clinical-50 text-clinical-600">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <p className="text-sm font-medium text-ink-900">Running as an installed app</p>
            <p className="text-sm text-ink-500">Force a refresh if you suspect you're on an older version.</p>
          </div>
        </div>
        <button onClick={handleCheckForUpdates} disabled={checking} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
          <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
          Check for updates
        </button>
      </div>
    );
  }

  if (canInstall) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clinical-50 text-clinical-600">
            <Download size={18} />
          </div>
          <div>
            <p className="text-sm font-medium text-ink-900">Install CPVS</p>
            <p className="text-sm text-ink-500">Adds it to your home screen for quick, full-screen access.</p>
          </div>
        </div>
        <button onClick={handleInstall} className="btn-primary shrink-0 px-3 py-1.5 text-xs">
          Install
        </button>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clinical-50 text-clinical-600">
          <Share size={18} />
        </div>
        <p className="text-sm text-ink-500">
          Tap <Share size={13} className="mb-0.5 inline" /> Share, then "Add to Home Screen" to install CPVS.
        </p>
      </div>
    );
  }

  // Neither installable nor iOS and not standalone — most likely a desktop
  // browser that doesn't support installable PWAs, or install criteria
  // haven't been met yet (Chrome waits for some engagement first).
  return <p className="text-sm text-ink-400">Install isn't available in this browser right now.</p>;
}

function NotificationRow() {
  const { showSuccess, showError } = useToast();
  const [permission, setPermission] = useState(getNotificationPermission());

  async function handleClick() {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') showSuccess("Notifications enabled — you'll get alerts even when this tab isn't focused.");
    else if (result === 'denied') showError("Notifications blocked. You can re-enable them in your browser's site settings.");
  }

  const statusLabel =
    permission === 'granted' ? 'Enabled' : permission === 'denied' ? 'Blocked in browser settings' : permission === 'unsupported' ? 'Not supported here' : 'Not enabled';

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clinical-50 text-clinical-600">
          {permission === 'granted' ? <Bell size={18} /> : <BellOff size={18} />}
        </div>
        <div>
          <p className="text-sm font-medium text-ink-900">Browser notifications</p>
          <p className="text-sm text-ink-500">{statusLabel}</p>
        </div>
      </div>
      {permission === 'default' && (
        <button onClick={handleClick} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
          Enable
        </button>
      )}
    </div>
  );
}

export default function Settings() {
  const { profile } = useAuth();
  const { preference, setPreference } = useTheme();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Settings</h1>

      <SettingsSection title="App" description="Install CPVS as an app, or check that you're on the latest version.">
        <InstallOrUpdateRow />
      </SettingsSection>

      <SettingsSection title="Appearance" description="Choose how CPVS looks on this device.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPreference(opt.value)}
              className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors ${
                preference === opt.value ? 'border-clinical-200 bg-clinical-50' : 'border-surface-line hover:bg-surface-muted'
              }`}
            >
              <opt.icon size={18} className={preference === opt.value ? 'text-clinical-600' : 'text-ink-400'} />
              <span className={`text-sm font-medium ${preference === opt.value ? 'text-clinical-700' : 'text-ink-700'}`}>{opt.label}</span>
              <span className="text-xs text-ink-400">{opt.blurb}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Notifications">
        <NotificationRow />
      </SettingsSection>

      <SettingsSection title="Account">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink-900">{profile?.full_name}</p>
              <p className="text-sm text-ink-500">{profile?.email}</p>
            </div>
          </div>
          <Link to="/change-password" className="btn-secondary inline-flex px-3 py-1.5 text-xs">
            <KeyRound size={13} />
            Change password
          </Link>
        </div>
      </SettingsSection>

      <div className="flex items-center gap-2 px-1 text-xs text-ink-300">
        <Info size={13} />
        CPVS — Clinical Practice Verification System
      </div>
    </div>
  );
}

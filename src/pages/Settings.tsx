import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sun, Moon, Sparkles, Download, Share, RefreshCw, CheckCircle2, KeyRound, Bell, BellOff, Info, LogOut, Fingerprint, Smartphone, type LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemePreference } from '../theme/ThemeProvider';
import { useToast } from '../context/ToastContext';
import { useInstallPrompt, getInstallInstructions } from '../hooks/useInstallPrompt';
import { getNotificationPermission, requestNotificationPermission } from '../utils/pushNotifications';
import { supabase } from '../lib/supabase';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { WebauthnCredential } from '../types/database';

/** `swatch` is a fixed two-colour preview of each theme's surface + accent.
 * It's deliberately hardcoded rather than read from CSS variables: the point
 * is to show what the OTHER themes look like while you're still in the
 * current one, and the variables only ever hold the active theme's values. */
const THEME_OPTIONS: { value: ThemePreference; icon: LucideIcon; label: string; blurb: string; swatch: [string, string] }[] = [
  { value: 'light', icon: Sun, label: 'Light', blurb: 'Bright, high-contrast', swatch: ['#f7f9fc', '#1f6dfa'] },
  { value: 'dark', icon: Moon, label: 'Dark', blurb: 'Easier on the eyes at night', swatch: ['#111317', '#4d8dff'] },
  { value: 'aether', icon: Sparkles, label: 'Aether', blurb: 'Dark with a lime accent', swatch: ['#16181a', '#adff2f'] },
];

/** Purely presentational wrapper. `icon` is optional so the shape of every
 * existing call site stays valid — it only adds a tinted tile beside the
 * heading when one is passed. */
function SettingsSection({ title, description, icon: Icon, children }: { title: string; description?: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="surface-card relative overflow-hidden p-6">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-clinical-500 via-vital-500 to-transparent" />
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="icon-tile mt-0.5 h-9 w-9 shrink-0 rounded-xl">
            <Icon size={16} strokeWidth={2.25} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm leading-relaxed text-ink-500">{description}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

/** Covers both halves of the request: on the website (or before install)
 * this shows the same install flow as the floating banner; once actually
 * running as an installed app (isStandalone), there's nothing to "install"
 * anymore, so it switches to a manual "check for updates" action instead. */
function InstallOrUpdateRow() {
  const { showSuccess, showError } = useToast();
  const { canInstall, isStandalone, install } = useInstallPrompt();
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
      <div className="inset-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="icon-tile-accent h-10 w-10 shrink-0 rounded-xl">
            <CheckCircle2 size={18} strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">Running as an installed app</p>
            <p className="text-sm leading-relaxed text-ink-500">Force a refresh if you suspect you're on an older version.</p>
          </div>
        </div>
        <button onClick={handleCheckForUpdates} disabled={checking} className="btn-secondary shrink-0 self-start px-3 py-1.5 text-xs sm:self-auto">
          <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
          Check for updates
        </button>
      </div>
    );
  }

  if (canInstall) {
    return (
      <div className="inset-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="icon-tile h-10 w-10 shrink-0 rounded-xl">
            <Download size={18} strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">Install CPVS</p>
            <p className="text-sm leading-relaxed text-ink-500">Adds it to your home screen for quick, full-screen access.</p>
          </div>
        </div>
        <button onClick={handleInstall} className="btn-primary shrink-0 self-start px-3 py-1.5 text-xs sm:self-auto">
          Install
        </button>
      </div>
    );
  }

  // No captured native prompt — either this browser doesn't support one
  // at all, or Chrome's own engagement heuristic hasn't been satisfied for
  // this visitor yet. Neither of those is something a website can force,
  // so every visitor gets real, browser-specific manual steps instead of
  // a dead end.
  const { steps, unsupported } = getInstallInstructions();
  return (
    <div className="inset-panel flex items-start gap-3 p-4">
      <div className="icon-tile h-10 w-10 shrink-0 rounded-xl">
        <Share size={18} strokeWidth={2.25} />
      </div>
      <div className="text-sm leading-relaxed text-ink-500">
        {unsupported ? (
          <p>{steps[0]}</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-4">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
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
    <div className="inset-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
            permission === 'granted'
              ? 'bg-status-present/12 text-status-present ring-status-present/25'
              : 'bg-surface-alt text-ink-400 ring-surface-line'
          }`}
        >
          {permission === 'granted' ? <Bell size={18} strokeWidth={2.25} /> : <BellOff size={18} strokeWidth={2.25} />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">Browser notifications</p>
          <p className="text-sm text-ink-500">{statusLabel}</p>
        </div>
      </div>
      {permission === 'default' && (
        <button onClick={handleClick} className="btn-secondary shrink-0 self-start px-3 py-1.5 text-xs sm:self-auto">
          Enable
        </button>
      )}
    </div>
  );
}

export default function Settings() {
  const { profile, student, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [credentials, setCredentials] = useState<WebauthnCredential[]>([]);

  useEffect(() => {
    if (student?.verification_method !== 'webauthn') return;
    supabase
      .from('webauthn_credentials')
      .select('*')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setCredentials(data ?? []));
  }, [student?.id, student?.verification_method]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    // signOut() clears the Supabase session; ProtectedRoute picks that up
    // and redirects to /login on its own, but navigating explicitly here
    // avoids a flash of a now-unauthenticated Settings page first.
    navigate('/login', { replace: true });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-2xl font-semibold tracking-tightest text-ink-900">Settings</h1>

      <SettingsSection icon={Download} title="App" description="Install CPVS as an app, or check that you're on the latest version.">
        <InstallOrUpdateRow />
      </SettingsSection>

      <SettingsSection icon={Sparkles} title="Appearance" description="Choose how CPVS looks on this device.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPreference(opt.value)}
              className={`group relative flex flex-col items-start gap-2.5 overflow-hidden rounded-xl2 p-4 text-left transition-all duration-300 ease-spring ${
                preference === opt.value
                  ? 'bg-gradient-to-br from-clinical-500/14 via-clinical-500/8 to-vital-500/8 ring-2 ring-inset ring-clinical-500/40'
                  : 'bg-surface-alt/40 ring-1 ring-inset ring-surface-line hover:-translate-y-0.5 hover:bg-surface hover:shadow-lift'
              }`}
            >
              {preference === opt.value && (
                <span className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-clinical-500/20 blur-2xl" />
              )}
              <span className="relative flex w-full items-center justify-between">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset transition-colors duration-300 ${
                    preference === opt.value
                      ? 'bg-clinical-500/15 text-clinical-600 ring-clinical-500/25'
                      : 'bg-surface-alt text-ink-400 ring-surface-line'
                  }`}
                >
                  <opt.icon size={15} strokeWidth={2.25} />
                </span>
                {/* Two-tone preview of the theme this button switches to. */}
                <span className="flex items-center -space-x-1.5">
                  <span className="h-4 w-4 rounded-full ring-1 ring-inset ring-black/10" style={{ background: opt.swatch[0] }} />
                  <span className="h-4 w-4 rounded-full ring-1 ring-inset ring-black/10" style={{ background: opt.swatch[1] }} />
                </span>
              </span>
              <span className={`relative text-sm font-semibold ${preference === opt.value ? 'text-clinical-700' : 'text-ink-700'}`}>{opt.label}</span>
              <span className="relative text-xs leading-relaxed text-ink-400">{opt.blurb}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection icon={Bell} title="Notifications">
        <NotificationRow />
      </SettingsSection>

      {profile?.role === 'student' && (
        <SettingsSection
          icon={Fingerprint}
          title="Biometric check-in"
          description="What CPVS uses to confirm it's really you at check-in time."
        >
          {student?.biometric_enrolled_at ? (
            <div className="inset-panel flex items-center gap-3.5 p-4">
              <div className="icon-tile-accent h-11 w-11 shrink-0 rounded-xl">
                <Fingerprint size={18} strokeWidth={2.25} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">
                  {student.verification_method === 'webauthn' ? 'Fingerprint / Face ID' : 'Selfie match'}
                </p>
                <p className="text-sm text-ink-500">Enrolled {new Date(student.biometric_enrolled_at).toLocaleDateString()}</p>
                {student.verification_method === 'webauthn' && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {credentials.length === 0 ? (
                      <span className="text-xs text-ink-400">No devices on file.</span>
                    ) : (
                      credentials.map((c) => (
                        <span key={c.id} className="chip py-0.5">
                          <Smartphone size={11} /> {c.device_label ?? 'Unnamed device'}
                        </span>
                      ))
                    )}
                  </div>
                )}
                {/* Deliberately no "change device" / "re-enroll" action here
                    — per how this feature is scoped, a student can never
                    reset this themselves (that's the whole point: it's the
                    thing proving check-ins are genuinely them, so it can't
                    be self-service). Lost or replaced your device? A Super
                    Coordinator can reset it from your student profile;
                    you'll be asked to enroll again automatically next time
                    you sign in after that. */}
                <p className="mt-2 text-xs leading-relaxed text-ink-400">
                  Lost your device or need to switch to a new one? Ask your coordinator — only a Super Coordinator can reset this, and you'll be walked through enrolling again right after.
                </p>
              </div>
            </div>
          ) : (
            <p className="rounded-xl2 border border-dashed border-surface-line py-4 text-center text-sm text-ink-400">Not enrolled yet.</p>
          )}
        </SettingsSection>
      )}

      <SettingsSection icon={KeyRound} title="Account">
        <div className="space-y-4">
          <div className="inset-panel flex items-center gap-3.5 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-vital-400 to-clinical-500 text-sm font-bold text-onAccent shadow-glow-accent ring-2 ring-surface">
              {profile?.full_name?.[0]?.toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{profile?.full_name}</p>
              <p className="truncate text-sm text-ink-500">{profile?.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/change-password" className="btn-secondary inline-flex px-3 py-1.5 text-xs">
              <KeyRound size={13} />
              Change password
            </Link>
            <button onClick={() => setConfirmingSignOut(true)} className="theme-danger-btn btn-secondary inline-flex !text-status-expired hover:!border-status-expired/40 px-3 py-1.5 text-xs">
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </div>
      </SettingsSection>

      <ConfirmDialog
        open={confirmingSignOut}
        title="Sign out of CPVS?"
        message="You'll need to sign back in with your username and password to continue."
        confirmLabel={signingOut ? 'Signing out…' : 'Sign out'}
        onConfirm={handleSignOut}
        onCancel={() => setConfirmingSignOut(false)}
      />

      <div className="flex items-center justify-center gap-2 px-1 pb-2 text-2xs font-medium uppercase tracking-widest text-ink-400">
        <Info size={12} />
        CPVS — Clinical Practice Verification System
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function ChangePassword() {
  const { profile, refreshProfile } = useAuth();
  const { showSuccess } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forced first-login flow (must_change_password) has no Cancel — there's
  // nothing to go back to yet, the account isn't fully set up. Reached
  // voluntarily instead (from Settings), Cancel makes sense and is shown.
  const isForced = !!profile?.must_change_password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      setSubmitting(false);
      setError(pwError.message);
      return;
    }

    if (profile) {
      // Clears the "you must change your password" flag so the app stops
      // redirecting back here on every page load.
      const { error: flagError } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', profile.id)
        .select();

      if (flagError) {
        setError(flagError.message);
        setSubmitting(false);
        return;
      }
    }

    await refreshProfile();
    setSubmitting(false);
    showSuccess('Password updated successfully.');
    navigate('/', { replace: true });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="animate-fadeUp w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="icon-tile-accent mb-5 h-14 w-14 rounded-xl3 shadow-glow-accent">
            <KeyRound size={24} strokeWidth={2.25} />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tightest text-ink-900">
            {isForced ? 'Set a new password' : 'Change your password'}
          </h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-500">
            {isForced ? 'This is your first sign-in. Choose a password only you know.' : 'Choose a new password for your account.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card relative space-y-4 overflow-hidden p-7">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-vital-500 via-clinical-500 to-vital-400" />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">New password</label>
            <div className="relative">
              <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="password"
                className="input-field pl-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-400">
              <ShieldCheck size={12} /> Use at least 8 characters.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Confirm password</label>
            <div className="relative">
              <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="password"
                className="input-field pl-10"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-status-expired/25 bg-status-expired/8 px-3.5 py-3 text-sm text-status-expired">
              <AlertCircle size={16} className="mt-px shrink-0" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          <div className={isForced ? 'pt-1' : 'flex gap-2.5 pt-1'}>
            {!isForced && (
              <button
                type="button"
                onClick={() => navigate('/')}
                disabled={submitting}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            )}
            <button type="submit" disabled={submitting} className={isForced ? 'btn-primary w-full' : 'btn-primary flex-1'}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              Save and continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

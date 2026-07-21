import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function ChangePassword() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      const { data, error } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', profile.id)
        .select();

      console.log("DATA:", data);
      console.log("ERROR:", error);

      if (error) {
        setError(error.message);
        setSubmitting(false);
        return;
      }
    }

    await refreshProfile();
    setSubmitting(false);
    navigate("/", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-md animate-fadeUp">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-vital-600 text-white shadow-glass">
            <KeyRound size={22} />
          </div>
          <h1 className="font-display text-xl font-semibold text-ink-900">Set a new password</h1>
          <p className="mt-1 text-sm text-ink-500">
            This is your first sign-in. Choose a password only you know.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card space-y-4 p-7">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">New password</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Confirm password</label>
            <input
              type="password"
              className="input-field"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="rounded-xl border border-status-expired/20 bg-status-expired/5 px-3 py-2 text-sm text-status-expired">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            Save and continue
          </button>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { signInWithUsername } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signInWithUsername(username, password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-md animate-fadeUp">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-clinical-600 text-white shadow-glass">
            <Stethoscope size={22} />
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">CPVS</h1>
          <p className="mt-1 text-sm text-ink-500">Clinical Practice Verification System</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card space-y-4 p-7">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Username</label>
            <input
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. aau-anes-2024-041"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Password</label>
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
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
            Sign in
          </button>

          <p className="text-center text-xs text-ink-500">
            Credentials are issued by your clinical coordinator. Contact them if you need access.
          </p>
        </form>
      </div>
    </div>
  );
}

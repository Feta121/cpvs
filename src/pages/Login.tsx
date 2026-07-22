import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { signInWithUsername, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    await refreshProfile();
    navigate('/', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-md animate-fadeUp">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/wordmark.png" alt="CPVS" className="mb-4 h-10 w-auto dark:brightness-0 dark:invert" />
          <p className="mt-1 text-sm text-ink-500">Clinical Practice Verification System</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card space-y-4 p-7">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              Username <span className="text-status-expired">*</span>
            </label>
            <input
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. kedir3152"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              Password <span className="text-status-expired">*</span>
            </label>
            <div className="relative">
              <input
                className="input-field pr-10"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-500"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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

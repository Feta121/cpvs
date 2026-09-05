import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Eye, EyeOff, User, Lock, AlertCircle, ShieldCheck, MapPin, CalendarClock, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Wordmark from '../components/ui/Wordmark';

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
    <div className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <div className="animate-fadeUp w-full max-w-5xl overflow-hidden rounded-xl4 border border-surface-line bg-surface/60 shadow-float backdrop-blur-xl lg:grid lg:grid-cols-[1.02fr_1fr]">
        {/* Brand panel — desktop only. Every color here resolves through the
            theme tokens (primary ramp + onPrimary), so the panel restains
            itself for Light / Dark / Aether instead of being hardcoded navy. */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-clinical-500 via-clinical-600 to-clinical-700 p-10 lg:flex">
          <span className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-vital-400/30 blur-3xl" />
          <span className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-onPrimary/10 blur-3xl" />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full bg-onPrimary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-onPrimary/80 ring-1 ring-inset ring-onPrimary/20">
              <span className="live-dot" /> Verified clinical practice
            </span>
            <h2 className="mt-7 max-w-sm font-display text-[2.1rem] font-semibold leading-[1.12] tracking-tightest text-onPrimary">
              Attendance you can prove, not just record.
            </h2>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-onPrimary/70">
              Location-verified check-ins, live rotation tracking, and coordinator oversight in one place.
            </p>
          </div>

          <ul className="relative mt-10 space-y-3.5">
            {[
              { icon: MapPin, text: 'Geofenced on-site check-in' },
              { icon: CalendarClock, text: 'Live rotation and schedule tracking' },
              { icon: ShieldCheck, text: 'Coordinator review and appeals' },
            ].map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm font-medium text-onPrimary/85">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-onPrimary/10 ring-1 ring-inset ring-onPrimary/20">
                  <f.icon size={15} />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        {/* Form panel */}
        <div className="p-7 sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <Wordmark className="h-14 lg:h-12" />
            <h1 className="mt-5 font-display text-xl font-semibold tracking-[-0.015em] text-ink-900">Welcome back</h1>
            <p className="mt-1.5 text-sm text-ink-500">Sign in to the Clinical Practice Verification System.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                Username <span className="text-status-expired">*</span>
              </label>
              <div className="relative">
                <User size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="input-field pl-10"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. kedir3152"
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                Password <span className="text-status-expired">*</span>
              </label>
              <div className="relative">
                <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="input-field pl-10 pr-10"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition-colors hover:text-clinical-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-status-expired/25 bg-status-expired/8 px-3.5 py-3 text-sm text-status-expired">
                <AlertCircle size={16} className="mt-px shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary group mt-1 w-full py-3">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              Sign in
              {!submitting && <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />}
            </button>

            <div className="hairline my-6" />

            <p className="text-center text-xs leading-relaxed text-ink-400">
              Credentials are issued by your clinical coordinator. Contact them if you need access.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

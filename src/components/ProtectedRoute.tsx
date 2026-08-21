import { Navigate } from 'react-router-dom';
import { ReactNode, useState } from 'react';
import { AlertTriangle, ShieldOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole, PermissionKey } from '../types/database';
import FullScreenLoader from './ui/FullScreenLoader';
import ConfirmDialog from './ui/ConfirmDialog';

export default function ProtectedRoute({
  children,
  allow,
  requireAny,
}: {
  children: ReactNode;
  allow: UserRole[];
  /** Added in migration 0012 (coordinator permissions). If provided, the
   * signed-in coordinator must have at least one of these permissions (or
   * be a Super Coordinator) to reach this route at all — this is what
   * stops someone from bypassing the hidden nav item by typing the URL
   * directly. Only meaningful for role: 'coordinator' routes; ignored for
   * student-only routes. */
  requireAny?: PermissionKey[];
}) {
  const { loading, profile, coordinator, authError, refreshProfile, signOut } = useAuth();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  if (loading) return <FullScreenLoader label="Checking your session…" />;

  // A session exists (Supabase Auth), but the profile/role fetch itself
  // failed — this used to look identical to "not logged in" and silently
  // bounce to /login, which is what made the coordinator dashboard seem to
  // vanish. Show the real error with a retry instead of guessing.
  if (authError && !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-muted px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-status-expired/10 text-status-expired">
          <AlertTriangle size={22} />
        </div>
        <p className="max-w-sm text-sm text-ink-700">{authError}</p>
        <div className="flex gap-2">
          <button onClick={() => refreshProfile()} className="btn-primary">Try again</button>
          <button onClick={() => setConfirmingSignOut(true)} className="btn-secondary">Sign out</button>
        </div>
        <ConfirmDialog
          open={confirmingSignOut}
          title="Sign out of CPVS?"
          message="You'll need to sign back in with your username and password to continue."
          confirmLabel="Sign out"
          onConfirm={() => signOut()}
          onCancel={() => setConfirmingSignOut(false)}
        />
      </div>
    );
  }

  if (!profile) return <Navigate to="/login" replace />;

  if (profile.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }

  if (!allow.includes(profile.role)) {
    return <Navigate to={profile.role === 'student' ? '/student' : '/coordinator'} replace />;
  }

  // Added in migration 0012. A deactivated coordinator's Supabase Auth
  // session still works (their password wasn't touched), but they should
  // see a clear "your access was suspended" message here rather than
  // hitting confusing RLS failures on every action, or worse, a
  // dashboard that half-loads and then silently fails to save anything.
  if (profile.role === 'coordinator' && coordinator && !coordinator.is_active) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-muted px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-status-expired/10 text-status-expired">
          <ShieldOff size={22} />
        </div>
        <p className="max-w-sm text-sm text-ink-700">
          Your coordinator account has been deactivated. Contact a Super Coordinator if you believe this is a mistake.
        </p>
        <button onClick={() => setConfirmingSignOut(true)} className="btn-secondary">Sign out</button>
        <ConfirmDialog
          open={confirmingSignOut}
          title="Sign out of CPVS?"
          message="You'll need to sign back in with your username and password to continue."
          confirmLabel="Sign out"
          onConfirm={() => signOut()}
          onCancel={() => setConfirmingSignOut(false)}
        />
      </div>
    );
  }

  // Added in migration 0012. Direct-URL bypass protection for pages hidden
  // from the sidebar because the coordinator lacks every relevant
  // permission for that area.
  if (requireAny && profile.role === 'coordinator' && coordinator) {
    const authorized = coordinator.is_super_coordinator || requireAny.some((key) => coordinator[key]);
    if (!authorized) return <Navigate to="/coordinator" replace />;
  }

  return <>{children}</>;
}

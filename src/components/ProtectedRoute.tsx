import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types/database';
import FullScreenLoader from './ui/FullScreenLoader';

export default function ProtectedRoute({
  children,
  allow,
}: {
  children: ReactNode;
  allow: UserRole[];
}) {
  const { loading, profile, authError, refreshProfile, signOut } = useAuth();

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
          <button onClick={() => signOut()} className="btn-secondary">Sign out</button>
        </div>
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

  return <>{children}</>;
}
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, Student, Coordinator } from '../types/database';

interface AuthContextValue {
  loading: boolean;
  profile: Profile | null;
  student: Student | null;
  coordinator: Coordinator | null;
  /** Non-null when the profile/role fetch itself failed (network, RLS, or a
   *  missing profiles/students/coordinators row) — distinct from "not logged
   *  in". Lets the UI show a real error + retry instead of spinning forever. */
  authError: string | null;
  signInWithUsername: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Students & coordinators log in with a username (no public email disclosure).
// Usernames map to a synthetic internal email: `${username}@cpvs.com`. If the
// person types something that already looks like an email, it's used as-is.
// This keeps Supabase's built-in email/password auth while giving
// coordinators full control over credential issuance.
function usernameToEmail(username: string) {
  const value = username.trim().toLowerCase();

  if (value.includes('@')) {
    return value;
  }

  return `${value}@cpvs.com`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [coordinator, setCoordinator] = useState<Coordinator | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // NOTE ON THE FIX: the previous version used `.single()`, which *throws*
  // when a query returns zero rows (e.g. a profiles row exists but its
  // matching students/coordinators row doesn't yet, or RLS silently filters
  // it out). Because that throw happened inside an awaited call with no
  // try/catch, the promise chain in the mount effect below never reached
  // `setLoading(false)` — the coordinator/student dashboard would just spin
  // forever with no visible error. `.maybeSingle()` returns `null` instead of
  // throwing, and everything here is now wrapped so `loading` always
  // resolves and failures are visible via `authError`.
  async function loadProfile(userId: string) {
    setAuthError(null);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData) {
        // Auth user exists but has no profiles row yet — a real, visible
        // condition rather than a silent infinite loader.
        setProfile(null);
        setStudent(null);
        setCoordinator(null);
        setAuthError('Your account has no profile on record yet. Contact your coordinator.');
        return;
      }

      setProfile(profileData);

      if (profileData.role === 'student') {
        const { data, error } = await supabase.from('students').select('*').eq('id', userId).maybeSingle();
        if (error) throw error;
        if (!data) {
          setAuthError('Your student record is missing details. Contact your coordinator.');
        }
        setStudent(data ?? null);
        setCoordinator(null);
      } else if (profileData.role === 'coordinator') {
        const { data, error } = await supabase.from('coordinators').select('*').eq('id', userId).maybeSingle();
        if (error) throw error;
        if (!data) {
          setAuthError('Your coordinator record is missing details. Contact an administrator.');
        }
        setCoordinator(data ?? null);
        setStudent(null);
      }
    } catch (err: any) {
      setProfile(null);
      setStudent(null);
      setCoordinator(null);
      setAuthError(err?.message ?? 'Unable to load your profile. Check your connection and try again.');
    }
  }

  async function refreshProfile() {
    const { data } = await supabase.auth.getUser();
    if (data.user) await loadProfile(data.user.id);
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) await loadProfile(data.session.user.id);
      } catch (err: any) {
        if (!cancelled) setAuthError(err?.message ?? 'Unable to reach the server.');
      } finally {
        // Always resolves — this is the exact line that used to get skipped
        // when loadProfile() threw, leaving the dashboard blank forever.
        if (!cancelled) setLoading(false);
      }
    }
    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadProfile(session.user.id);
      } else {
        setProfile(null);
        setStudent(null);
        setCoordinator(null);
        setAuthError(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signInWithUsername(username: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) return { error: 'Incorrect username or password.' };
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ loading, profile, student, coordinator, authError, signInWithUsername, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

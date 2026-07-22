import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'cpvs-theme-preference';

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  // Backward compatible: a previously-stored 'system' value (from before this
  // spec required removing the system option) simply resolves to 'light'.
  return stored === 'dark' ? 'dark' : 'light';
}

function useThemeState(): ThemeContextValue {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', preference === 'dark');
  }, [preference]);

  function setPreference(pref: ThemePreference) {
    setPreferenceState(pref);
    window.localStorage.setItem(STORAGE_KEY, pref);
  }

  function toggle() {
    setPreference(preference === 'dark' ? 'light' : 'dark');
  }

  return { preference, setPreference, toggle };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeState();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Does NOT throw when no <ThemeProvider> is found above it in the tree —
 * see the incident this avoided: a hard throw here previously caused a full
 * white-screen crash after login. Falls back to a fully-working local
 * instance of the same logic instead.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  const fallback = useThemeState();

  useEffect(() => {
    if (!ctx) {
      console.warn('[CPVS] useTheme() was called outside <ThemeProvider>. Falling back to a local theme instance.');
    }
  }, [ctx]);

  return ctx ?? fallback;
}

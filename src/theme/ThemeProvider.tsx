import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  /** What the user picked: 'light' | 'dark' | 'system'. */
  preference: ThemePreference;
  /** The resolved theme actually applied ('system' resolves to the OS setting). */
  resolvedTheme: 'light' | 'dark';
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'cpvs-theme-preference';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function useThemeState(): ThemeContextValue {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    preference === 'system' ? getSystemTheme() : preference
  );

  // Apply the resolved theme to <html> immediately whenever it changes — this
  // is what makes the whole app update without a refresh (App.tsx and every
  // page use theme *tokens*, not hardcoded colors, so flipping this one class
  // is sufficient; see tailwind.config.js `darkMode: 'class'`).
  useEffect(() => {
    const next = preference === 'system' ? getSystemTheme() : preference;
    setResolvedTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }, [preference]);

  // If the user picked "system", keep following the OS setting live.
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const next = getSystemTheme();
      setResolvedTheme(next);
      document.documentElement.classList.toggle('dark', next === 'dark');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  function setPreference(pref: ThemePreference) {
    setPreferenceState(pref);
    window.localStorage.setItem(STORAGE_KEY, pref);
  }

  return { preference, resolvedTheme, setPreference };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeState();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * IMPORTANT: this deliberately does NOT throw when no <ThemeProvider> is
 * found above it in the tree. It used to (`if (!ctx) throw ...`), which
 * caused a full white-screen crash after login whenever the component tree
 * rendering the theme toggle wasn't actually inside <ThemeProvider> — e.g.
 * if main.tsx doesn't wrap <App /> in it, or wraps it in the wrong place.
 *
 * Instead, if there's no provider in the tree, this hook runs the *exact
 * same* fully-working logic locally (reads/writes the same localStorage key,
 * toggles the same <html> class, follows system preference live). The app
 * never crashes, and clicking Light/Dark/System always actually works —
 * unlike a patch that hardcodes `{ preference: 'light', setPreference: () =>
 * {} }`, which silently does nothing and explains "stuck on Light, only
 * system changes it."
 *
 * If you see the console warning below, it means <ThemeProvider> genuinely
 * isn't wrapping this part of the tree — check that src/main.tsx still has
 * <ThemeProvider> around <App />, and that no other entry file (e.g. a
 * leftover index.tsx) is being used instead of main.tsx.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  const fallback = useThemeState();

  useEffect(() => {
    if (!ctx) {
      console.warn(
        '[CPVS] useTheme() was called outside <ThemeProvider>. Falling back to a local theme instance — ' +
        'this still works, but check src/main.tsx to make sure <ThemeProvider> wraps <App />.'
      );
    }
  }, [ctx]);

  return ctx ?? fallback;
}

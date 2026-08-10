import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'aether';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  /** Cycles light -> dark -> aether -> light. Kept for any existing caller
   * that just wants "the next theme" without picking one explicitly. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'cpvs-theme-preference';
const THEME_CLASSES: Record<ThemePreference, string | null> = {
  light: null, // light has no class — it's the :root default
  dark: 'dark',
  aether: 'theme-aether',
};
const CYCLE_ORDER: ThemePreference[] = ['light', 'dark', 'aether'];

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'aether') return stored;
  // Backward compatible: anything else (including a stale 'system' value
  // from before that option was removed) resolves to 'light'.
  return 'light';
}

function useThemeState(): ThemeContextValue {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);

  useEffect(() => {
    const root = document.documentElement;
    // Remove every theme class before applying the current one, rather than
    // a simple boolean toggle — now that there are three mutually exclusive
    // options instead of two.
    Object.values(THEME_CLASSES).forEach((cls) => cls && root.classList.remove(cls));
    const activeClass = THEME_CLASSES[preference];
    if (activeClass) root.classList.add(activeClass);
  }, [preference]);

  function setPreference(pref: ThemePreference) {
    setPreferenceState(pref);
    window.localStorage.setItem(STORAGE_KEY, pref);
  }

  function toggle() {
    const next = CYCLE_ORDER[(CYCLE_ORDER.indexOf(preference) + 1) % CYCLE_ORDER.length];
    setPreference(next);
  }

  return { preference, setPreference, toggle };
}

export function toNativeColorScheme(preference: ThemePreference): 'light' | 'dark' {
  return preference === 'light' ? 'light' : 'dark';
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

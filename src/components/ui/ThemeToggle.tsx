import { motion } from 'framer-motion';
import { Sun, Moon, Sparkles, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { useTheme, ThemePreference } from '../../theme/ThemeProvider';

const THEME_OPTIONS: { value: ThemePreference; icon: LucideIcon; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'aether', icon: Sparkles, label: 'Aether' },
];

/**
 * Was private to components/layout/AppShell.tsx. Pulled out unchanged so the
 * sign-in page (which renders before a session exists, and so never mounts
 * AppShell) can use the exact same control instead of going without one.
 */
export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const activeIndex = THEME_OPTIONS.findIndex((o) => o.value === preference);

  /* The track keeps its exact h-9 / w-24 / p-1 box and the thumb its h-7,
     because the sliding thumb's position is computed from those numbers
     (calc((100% - 8px) / 3)). The outline is an inset RING rather than a
     border for the same reason — a border would shrink the padding box the
     calc() resolves against. */
  return (
    <div className="relative flex h-9 w-24 items-center rounded-full bg-surface-alt p-1 ring-1 ring-inset ring-surface-line">
      <motion.div
        className="absolute h-7 rounded-full bg-surface shadow-card ring-1 ring-clinical-500/20"
        style={{ width: 'calc((100% - 8px) / 3)' }}
        animate={{ left: `calc(4px + ${activeIndex} * (100% - 8px) / 3)` }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setPreference(opt.value)}
          aria-label={`${opt.label} theme`}
          title={`${opt.label} theme`}
          className="relative z-10 flex h-7 flex-1 items-center justify-center"
        >
          <opt.icon
            size={14}
            className={clsx(
              'transition-colors',
              preference === opt.value ? 'text-clinical-600' : 'text-ink-400 hover:text-ink-600',
            )}
          />
        </button>
      ))}
    </div>
  );
}

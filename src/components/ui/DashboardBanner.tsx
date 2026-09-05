import { useTheme } from '../../theme/ThemeProvider';

/**
 * Dashboard header strip — logo + title only, per request (the previous
 * version's tagline, divider, and "Monitoring active" indicator were all
 * removed, not just hidden on mobile — LiveClock directly above already
 * covers date/time, so this stays minimal).
 *
 * Three separate logo images, one per theme, rather than a single CSS
 * recolor: Light uses the original multi-color artwork unchanged; Aether
 * needs the whole mark in one flat lime (a uniform recolor, same idea as
 * the sidebar's <Wordmark>); Dark needs a *partial* recolor — only the
 * navy letters (C, S) turn white, the teal ones (P, the checkmark) stay
 * teal. That last one specifically can't be done with a CSS mask (a mask
 * only encodes alpha, it has no way to single out "just the navy pixels"
 * within one image) — it had to be pre-rendered pixel-by-pixel instead,
 * see wordmark-dark.png / wordmark-aether.png.
 */
export default function DashboardBanner() {
  const { preference } = useTheme();
  const src = preference === 'dark' ? '/wordmark-dark.png' : preference === 'aether' ? '/wordmark-aether.png' : '/wordmark.png';

  return (
    <div className="surface-card relative flex items-center gap-3 overflow-hidden px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-5">
      {/* Full-bleed gradient rail + corner bloom, so the app's header strip
          carries the brand colors instead of reading as an empty white bar. */}
      <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-clinical-500 via-vital-500 to-clinical-400" />
      <span className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-clinical-500/12 blur-3xl" />
      <span className="pointer-events-none absolute -bottom-24 left-1/3 h-40 w-40 rounded-full bg-vital-500/10 blur-3xl" />

      <img src={src} alt="CPVS" className="relative h-7 w-auto shrink-0 sm:h-9" />
      <span className="relative hidden h-8 w-px bg-surface-line sm:block" />
      <p className="relative font-display text-sm font-semibold leading-tight tracking-[-0.01em] text-ink-900 sm:text-base">
        Clinical Practice Verification System
      </p>
    </div>
  );
}

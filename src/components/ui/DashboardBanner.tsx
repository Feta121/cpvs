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
    <div className="surface-card flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
      <img src={src} alt="CPVS" className="h-7 w-auto shrink-0 sm:h-9" />
      <p className="font-display text-sm font-semibold leading-tight text-ink-900 sm:text-base">
        Clinical Practice Verification System
      </p>
    </div>
  );
}

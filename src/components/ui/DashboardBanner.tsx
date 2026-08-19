import { useTheme, toNativeColorScheme } from '../../theme/ThemeProvider';

/**
 * Top-of-dashboard hero banner. Swaps images based on the resolved theme —
 * these are pre-rendered graphics (not something CSS filters could safely
 * invert like the wordmark), so both a light and a dark version are shipped
 * and the correct one is picked at render time. The Aether theme is also
 * dark-based, so it uses the same mapping as Dark via toNativeColorScheme.
 *
 * CHANGED: this mapping is intentionally inverted from what the filenames
 * suggest — the white/light-background graphic (banner-light.png) is shown
 * for the Dark and Aether themes, and the navy/dark-background graphic
 * (banner-dark.png) is shown for the Light theme. This was a deliberate
 * choice, not a bug — don't "fix" this back to the filename-matching
 * mapping without checking first.
 */
export default function DashboardBanner() {
  const { preference } = useTheme();
  const src = toNativeColorScheme(preference) === 'dark' ? '/banner-light.png' : '/banner-dark.png';

  return (
    <div className="overflow-hidden rounded-xl2 border border-surface-line shadow-card">
      <img src={src} alt="Clinical Practice Verification System" className="block h-auto w-full" />
    </div>
  );
}
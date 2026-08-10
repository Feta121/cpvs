import { useTheme, toNativeColorScheme } from '../../theme/ThemeProvider';

/**
 * Top-of-dashboard hero banner. Swaps images based on the resolved theme —
 * these are pre-rendered graphics (not something CSS filters could safely
 * invert like the wordmark), so both a light and a dark version are shipped
 * and the correct one is picked at render time. The Aether theme is also
 * dark-based, so it uses the dark banner too via the same light/dark
 * mapping used for native form control styling elsewhere.
 */
export default function DashboardBanner() {
  const { preference } = useTheme();
  const src = toNativeColorScheme(preference) === 'dark' ? '/banner-dark.png' : '/banner-light.png';

  return (
    <div className="overflow-hidden rounded-xl2 border border-surface-line shadow-card">
      <img src={src} alt="Clinical Practice Verification System" className="block h-auto w-full" />
    </div>
  );
}

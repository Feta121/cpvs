import { Activity } from 'lucide-react';

/**
 * Compact dashboard header strip — replaces the old full-height hero
 * banner (which used a 2.4:1 pre-rendered image per theme) with a much
 * shorter, coded banner (~40% of the previous height) so it reads as a
 * quick identity strip rather than a hero graphic eating the top of the
 * dashboard.
 *
 * Uses the ORIGINAL multi-color CPVS logo (navy/teal) directly, not the
 * theme-tinted <Wordmark> used in the sidebar — that's intentional per
 * request: brand identity here stays constant across all three themes,
 * unlike the rest of the chrome.
 *
 * The right-hand "Live monitoring" indicator ties back to something real
 * about this specific app (the mark-absences cron job actually does run
 * continuously in the background) rather than being a decorative filler
 * stat — LiveClock already covers date/time immediately above this, so
 * repeating that here would just be redundant.
 */
export default function DashboardBanner() {
  return (
    <div className="surface-card relative flex items-center gap-4 overflow-hidden px-5 py-4 sm:gap-5 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-clinical-50/60 via-transparent to-vital-50/40" />

      <img src="/wordmark.png" alt="CPVS" className="relative z-10 h-8 w-auto shrink-0 sm:h-9" />

      <div className="relative z-10 h-8 w-px shrink-0 bg-surface-line sm:h-9" />

      <div className="relative z-10 min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold text-ink-900 sm:text-base">
          Clinical Practice Verification System
        </p>
        <p className="truncate text-xs text-ink-500">Secure · Accurate · Real-Time Clinical Attendance</p>
      </div>

      <div className="relative z-10 hidden shrink-0 items-center gap-2 rounded-full border border-surface-line bg-surface px-3 py-1.5 sm:flex">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-vital-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-vital-600" />
        </span>
        <Activity size={13} className="text-vital-600" />
        <span className="text-xs font-medium text-ink-700">Monitoring active</span>
      </div>
    </div>
  );
}
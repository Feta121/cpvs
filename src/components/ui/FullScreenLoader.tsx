export default function FullScreenLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-6 bg-surface-muted">
      {/* Two counter-rotating arcs in the theme's primary and accent colors,
          around a breathing core — reads as one branded object instead of a
          generic spinner, and picks up all three themes automatically. */}
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full border border-surface-line" />
        <div className="absolute inset-0 animate-spinSlow rounded-full border-2 border-transparent border-r-clinical-500/40 border-t-clinical-500" />
        <div className="absolute inset-[7px] animate-spinReverse rounded-full border-2 border-transparent border-b-vital-500 border-l-vital-500/40" />
        <div className="absolute inset-[40%] animate-pulseRing rounded-full bg-clinical-500" />
      </div>
      <p className="font-display text-sm font-medium tracking-[0.06em] text-ink-500">{label}</p>
    </div>
  );
}

interface ProgressRingProps {
  /** 0–100 */
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  tone?: 'clinical' | 'vital';
}

/**
 * Generic SVG circular progress ring. Pure presentation — takes a
 * percentage and renders it, no data fetching. Reused by the student
 * dashboard's Clinical Progress card.
 */
export default function ProgressRing({
  percentage,
  size = 140,
  strokeWidth = 12,
  label,
  sublabel,
  tone = 'clinical',
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  // The progress arc is painted with a two-stop gradient rather than a flat
  // color. Both stops still come from the theme tokens, so the ring
  // restains itself per theme; the id is keyed off `tone` so two rings of
  // the same tone simply share one (identical) gradient definition.
  const gradientId = `progress-ring-${tone}`;
  const fromColor = tone === 'clinical' ? 'rgb(var(--primary-500))' : 'rgb(var(--accent-500))';
  const toColor = tone === 'clinical' ? 'rgb(var(--accent-500))' : 'rgb(var(--primary-500))';
  const glowColor = tone === 'clinical' ? 'rgb(var(--primary-500) / 0.45)' : 'rgb(var(--accent-500) / 0.45)';

  return (
    <div className="group relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={fromColor} />
            <stop offset="100%" stopColor={toColor} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--surface-line))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
            filter: `drop-shadow(0 0 6px ${glowColor})`,
          }}
        />
      </svg>
      {/* Soft radial bloom behind the readout so the number sits on a lit
          center instead of a bare card surface. */}
      <span
        className="pointer-events-none absolute rounded-full blur-2xl"
        style={{
          width: size * 0.6,
          height: size * 0.6,
          background: `radial-gradient(circle, ${glowColor}, transparent 70%)`,
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="stat-value text-[1.75rem] leading-none text-ink-900">{Math.round(clamped)}%</span>
        {label && <span className="mt-1.5 max-w-[75%] text-center text-[11px] font-medium leading-tight text-ink-500">{label}</span>}
        {sublabel && <span className="mt-0.5 text-[10px] text-ink-400">{sublabel}</span>}
      </div>
    </div>
  );
}
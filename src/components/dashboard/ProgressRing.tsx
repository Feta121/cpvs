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
  const strokeColor = tone === 'clinical' ? 'rgb(15 109 250)' : 'rgb(15 160 128)';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
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
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-semibold text-ink-900">{Math.round(clamped)}%</span>
        {label && <span className="mt-0.5 text-center text-[11px] leading-tight text-ink-500">{label}</span>}
        {sublabel && <span className="text-[10px] text-ink-300">{sublabel}</span>}
      </div>
    </div>
  );
}

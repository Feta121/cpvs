import { Award, Sunrise, CheckCircle2, LucideIcon } from 'lucide-react';

export interface Achievement {
  id: 'perfect_attendance' | 'early_checkin' | 'rotation_completed';
  label: string;
  description: string;
  earned: boolean;
}

const ICONS: Record<Achievement['id'], LucideIcon> = {
  perfect_attendance: Award,
  early_checkin: Sunrise,
  rotation_completed: CheckCircle2,
};

/**
 * Renders achievement badges. Pure presentation — StudentDashboard computes
 * `earned` for each from real attendance/rotation data (see the criteria
 * documented next to where they're built).
 */
export default function AchievementBadges({ achievements }: { achievements: Achievement[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {achievements.map((a) => {
        const Icon = ICONS[a.id];
        return (
          <div
            key={a.id}
            className={`group relative flex flex-col items-center gap-3 overflow-hidden rounded-xl2 border p-4 text-center transition-all duration-300 ease-spring ${
              a.earned
                ? 'border-transparent bg-gradient-to-b from-vital-500/14 to-vital-500/4 ring-1 ring-inset ring-vital-500/25 hover:-translate-y-0.5 hover:shadow-lift'
                : 'border-surface-line bg-surface-alt/40 opacity-45 grayscale'
            }`}
          >
            {a.earned && (
              <span className="pointer-events-none absolute -top-10 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-vital-500/25 blur-2xl transition-opacity duration-500 group-hover:opacity-100 sm:opacity-70" />
            )}
            <div
              className={`relative flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-300 ease-spring ${
                a.earned
                  ? 'bg-gradient-to-br from-vital-400 to-vital-600 text-onAccent shadow-glow-accent group-hover:scale-105'
                  : 'bg-surface-muted text-ink-400 ring-1 ring-inset ring-surface-line'
              }`}
            >
              <Icon size={19} strokeWidth={2.25} />
            </div>
            <div className="relative">
              <p className="text-xs font-bold tracking-[-0.01em] text-ink-900">{a.label}</p>
              <p className="mt-1 text-[11px] leading-snug text-ink-500">{a.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

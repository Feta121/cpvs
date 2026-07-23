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
            className={`flex flex-col items-center gap-2 rounded-xl2 border p-4 text-center transition-opacity ${
              a.earned ? 'border-vital-200 bg-vital-50' : 'border-surface-line opacity-40 grayscale'
            }`}
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${a.earned ? 'bg-vital-500 text-white' : 'bg-surface-muted text-ink-300'}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-900">{a.label}</p>
              <p className="mt-0.5 text-[11px] text-ink-500">{a.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

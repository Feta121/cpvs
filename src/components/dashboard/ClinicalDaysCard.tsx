import { useEffect, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '../../context/ToastContext';
import type { ClinicalDaysConfig } from '../../types/database';

const DAYS: { key: keyof Omit<ClinicalDaysConfig, 'id' | 'updated_by' | 'updated_at'>; label: string }[] = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
];

/**
 * Lets a coordinator choose which weekdays count as clinical practice days
 * — this drives both the student check-in page (which days check-in is
 * open) and mark-absences (which days trigger an absence if no check-in).
 * Defaults to Monday/Tuesday/Wednesday on, matching the program's standard
 * schedule, until a coordinator changes it.
 */
export default function ClinicalDaysCard() {
  const { coordinator } = useAuth();
  const { has } = usePermissions();
  const canEdit = has('can_manage_schedules');
  const { showSuccess, showError } = useToast();
  const [config, setConfig] = useState<ClinicalDaysConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('clinical_days_config').select('*').eq('id', true).maybeSingle();
    if (error) showError('Unable to load clinical days config. ' + error.message);
    setConfig((data as any) ?? null);
    setLoading(false);
  }

  async function toggle(day: (typeof DAYS)[number]['key']) {
    if (!config) return;
    const nextValue = !config[day];
    setSavingKey(day);
    setConfig({ ...config, [day]: nextValue }); // optimistic

    const { error } = await supabase
      .from('clinical_days_config')
      .update({ [day]: nextValue, updated_by: coordinator?.id, updated_at: new Date().toISOString() })
      .eq('id', true);

    setSavingKey(null);
    if (error) {
      setConfig(config); // revert
      showError('Unable to update schedule. ' + error.message);
      return;
    }
    showSuccess(`${day[0].toUpperCase()}${day.slice(1)} is now a ${nextValue ? 'clinical practice day' : 'non-practice day'}.`);
  }

  return (
    <div className="surface-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="icon-tile h-9 w-9">
          <CalendarDays size={17} strokeWidth={2.25} />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-ink-900">Weekly clinical schedule</h2>
          <p className="text-xs text-ink-400">Check-in windows and absence rules</p>
        </div>
      </div>
      <p className="mb-5 text-xs leading-relaxed text-ink-500">
        Choose which days count as clinical practice — check-in opens on these days, and students are auto-marked absent if they miss one.
      </p>

      {loading || !config ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-ink-400" /></div>
      ) : (
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
          {DAYS.map((d) => {
            const active = config[d.key];
            return (
              <div
                key={d.key}
                className={`flex flex-col items-center gap-3 rounded-xl2 border p-3 transition-all duration-300 ease-spring ${
                  active
                    ? 'border-transparent bg-gradient-to-b from-clinical-500/16 to-vital-500/8 ring-1 ring-inset ring-clinical-500/25'
                    : 'border-surface-line bg-surface-alt/40'
                }`}
              >
                <span className={`text-xs font-bold uppercase tracking-wider ${active ? 'text-clinical-700' : 'text-ink-400'}`}>{d.label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  aria-label={`${d.label} clinical day`}
                  onClick={() => toggle(d.key)}
                  disabled={savingKey === d.key || !canEdit}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? 'bg-gradient-to-r from-clinical-500 to-clinical-600 shadow-[0_2px_10px_-2px_rgb(var(--primary-500)/0.6)]'
                      : 'bg-ink-300/40 ring-1 ring-inset ring-surface-line'
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-spring ${
                      active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
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
      <div className="mb-4 flex items-center gap-2">
        <CalendarDays size={16} className="text-clinical-600" />
        <h2 className="font-display text-base font-semibold text-ink-900">Weekly clinical schedule</h2>
      </div>
      <p className="mb-4 text-xs text-ink-500">
        Choose which days count as clinical practice — check-in opens on these days, and students are auto-marked absent if they miss one.
      </p>

      {loading || !config ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-ink-300" /></div>
      ) : (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
          {DAYS.map((d) => {
            const active = config[d.key];
            return (
              <div
                key={d.key}
                className={`flex flex-col items-center gap-3 rounded-xl border p-3 transition-colors ${
                  active ? 'border-clinical-200 bg-clinical-50' : 'border-surface-line'
                }`}
              >
                <span className={`text-xs font-semibold ${active ? 'text-clinical-700' : 'text-ink-500'}`}>{d.label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  aria-label={`${d.label} clinical day`}
                  onClick={() => toggle(d.key)}
                  disabled={savingKey === d.key}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-60 ${
                    active ? 'bg-clinical-500' : 'bg-ink-300/50'
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
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

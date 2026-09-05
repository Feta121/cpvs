import { ShieldCheck } from 'lucide-react';
import type { PermissionKey } from '../../types/database';

export interface PermissionsValue {
  is_super_coordinator: boolean;
  is_active: boolean;
  can_create_students: boolean;
  can_edit_students: boolean;
  can_delete_students: boolean;
  can_create_hospitals: boolean;
  can_edit_hospitals: boolean;
  can_delete_hospitals: boolean;
  can_create_rotations: boolean;
  can_edit_rotations: boolean;
  can_delete_rotations: boolean;
  can_manage_attendance: boolean;
  can_review_appeals: boolean;
  can_send_announcements: boolean;
  can_manage_schedules: boolean;
  can_view_reports: boolean;
  can_system_settings: boolean;
}

export const DEFAULT_PERMISSIONS: PermissionsValue = {
  is_super_coordinator: false,
  is_active: true,
  can_create_students: false,
  can_edit_students: false,
  can_delete_students: false,
  can_create_hospitals: false,
  can_edit_hospitals: false,
  can_delete_hospitals: false,
  can_create_rotations: false,
  can_edit_rotations: false,
  can_delete_rotations: false,
  can_manage_attendance: false,
  can_review_appeals: false,
  can_send_announcements: false,
  can_manage_schedules: false,
  can_view_reports: false,
  can_system_settings: false,
};

const PERMISSION_GROUPS: { title: string; items: { key: PermissionKey; label: string }[] }[] = [
  {
    title: 'Students',
    items: [
      { key: 'can_create_students', label: 'Create students' },
      { key: 'can_edit_students', label: 'Edit students' },
      { key: 'can_delete_students', label: 'Delete students' },
    ],
  },
  {
    title: 'Hospitals',
    items: [
      { key: 'can_create_hospitals', label: 'Create hospitals' },
      { key: 'can_edit_hospitals', label: 'Edit hospitals' },
      { key: 'can_delete_hospitals', label: 'Delete hospitals' },
    ],
  },
  {
    title: 'Rotations',
    items: [
      { key: 'can_create_rotations', label: 'Create rotations' },
      { key: 'can_edit_rotations', label: 'Edit rotations' },
      { key: 'can_delete_rotations', label: 'Delete rotations' },
    ],
  },
  {
    title: 'Attendance & appeals',
    items: [
      { key: 'can_manage_attendance', label: 'Manage attendance' },
      { key: 'can_review_appeals', label: 'Review appeals' },
    ],
  },
  {
    title: 'Communication & schedule',
    items: [
      { key: 'can_send_announcements', label: 'Send announcements' },
      { key: 'can_manage_schedules', label: 'Manage schedules' },
    ],
  },
  {
    title: 'Reserved — no page yet',
    items: [
      { key: 'can_view_reports', label: 'View reports' },
      { key: 'can_system_settings', label: 'System settings' },
    ],
  },
];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? 'bg-gradient-to-r from-clinical-500 to-clinical-600 shadow-[0_2px_10px_-2px_rgb(var(--primary-500)/0.6)]'
          : 'bg-ink-300/40 ring-1 ring-inset ring-surface-line'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-spring ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/**
 * Grouped permission toggles — used both inline in the "Add coordinator"
 * form and inside the "Edit permissions" modal for an existing one, so the
 * two flows can never drift out of sync with each other.
 *
 * The Super Coordinator toggle sits above the grouped list, not inside it
 * — visually distinct since granting it makes every toggle below it moot
 * (a Super Coordinator implicitly has all of them). Those toggles are
 * disabled and shown checked while it's on, so the panel is honest about
 * what's actually in effect rather than showing stale unchecked boxes
 * next to "this person can do everything anyway."
 */
export default function PermissionsFieldset({
  value,
  onChange,
  hideActiveToggle,
}: {
  value: PermissionsValue;
  onChange: (next: PermissionsValue) => void;
  /** Hide the Active/Deactivated toggle — used on the Add form, since a
   * brand-new account is always created active; deactivating only makes
   * sense as an action on an existing account. */
  hideActiveToggle?: boolean;
}) {
  function set<K extends keyof PermissionsValue>(key: K, v: PermissionsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-4">
      <div className="relative flex items-center justify-between gap-4 overflow-hidden rounded-xl2 bg-gradient-to-r from-clinical-500/14 via-clinical-500/8 to-vital-500/8 p-4 ring-1 ring-inset ring-clinical-500/25">
        <span className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-clinical-500/18 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <span className="icon-tile h-9 w-9 shrink-0">
            <ShieldCheck size={17} strokeWidth={2.25} />
          </span>
          <div>
            <p className="text-sm font-bold tracking-[-0.01em] text-clinical-700">Super Coordinator</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-500">Full access — every permission below is automatically granted.</p>
          </div>
        </div>
        <Toggle checked={value.is_super_coordinator} onChange={(v) => set('is_super_coordinator', v)} />
      </div>

      {!hideActiveToggle && (
        <div className="flex items-center justify-between gap-4 rounded-xl2 border border-surface-line bg-surface-alt/40 p-4">
          <div>
            <p className="text-sm font-semibold text-ink-900">Account active</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-500">Deactivating suspends all coordinator access without deleting the account.</p>
          </div>
          <Toggle checked={value.is_active} onChange={(v) => set('is_active', v)} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.title} className="rounded-xl2 border border-surface-line bg-surface-alt/30 p-4 transition-colors duration-300 hover:border-clinical-300/60">
            <p className="section-label mb-3.5 flex items-center gap-2">
              {group.title}
              <span className="h-px flex-1 bg-surface-line" />
            </p>
            <div className="space-y-3">
              {group.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3">
                  <span className={`text-sm font-medium ${value.is_super_coordinator ? 'text-ink-400' : 'text-ink-700'}`}>{item.label}</span>
                  <Toggle
                    checked={value.is_super_coordinator || value[item.key]}
                    onChange={(v) => set(item.key, v)}
                    disabled={value.is_super_coordinator}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
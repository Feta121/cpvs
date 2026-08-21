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
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-clinical-500' : 'bg-ink-300/50'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
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
      <div className="flex items-center justify-between rounded-xl border border-clinical-200 bg-clinical-50 p-4">
        <div>
          <p className="text-sm font-semibold text-clinical-700">Super Coordinator</p>
          <p className="text-xs text-ink-500">Full access — every permission below is automatically granted.</p>
        </div>
        <Toggle checked={value.is_super_coordinator} onChange={(v) => set('is_super_coordinator', v)} />
      </div>

      {!hideActiveToggle && (
        <div className="flex items-center justify-between rounded-xl border border-surface-line p-4">
          <div>
            <p className="text-sm font-medium text-ink-900">Account active</p>
            <p className="text-xs text-ink-500">Deactivating suspends all coordinator access without deleting the account.</p>
          </div>
          <Toggle checked={value.is_active} onChange={(v) => set('is_active', v)} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.title} className="rounded-xl border border-surface-line p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">{group.title}</p>
            <div className="space-y-2.5">
              {group.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3">
                  <span className={`text-sm ${value.is_super_coordinator ? 'text-ink-400' : 'text-ink-700'}`}>{item.label}</span>
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

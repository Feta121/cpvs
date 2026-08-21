import { useState } from 'react';
import { X, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import PermissionsFieldset, { PermissionsValue } from './PermissionsFieldset';
import type { Coordinator } from '../../types/database';

export default function CoordinatorPermissionsModal({
  coordinator,
  fullName,
  onClose,
  onSaved,
}: {
  coordinator: Coordinator;
  fullName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const [value, setValue] = useState<PermissionsValue>({
    is_super_coordinator: coordinator.is_super_coordinator,
    is_active: coordinator.is_active,
    can_create_students: coordinator.can_create_students,
    can_edit_students: coordinator.can_edit_students,
    can_delete_students: coordinator.can_delete_students,
    can_create_hospitals: coordinator.can_create_hospitals,
    can_edit_hospitals: coordinator.can_edit_hospitals,
    can_delete_hospitals: coordinator.can_delete_hospitals,
    can_create_rotations: coordinator.can_create_rotations,
    can_edit_rotations: coordinator.can_edit_rotations,
    can_delete_rotations: coordinator.can_delete_rotations,
    can_manage_attendance: coordinator.can_manage_attendance,
    can_review_appeals: coordinator.can_review_appeals,
    can_send_announcements: coordinator.can_send_announcements,
    can_manage_schedules: coordinator.can_manage_schedules,
    can_view_reports: coordinator.can_view_reports,
    can_system_settings: coordinator.can_system_settings,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    // update_coordinator_permissions is a SECURITY DEFINER RPC (migration
    // 0012) — it independently re-checks that the caller is an active
    // Super Coordinator and that the target isn't the caller themselves
    // (and, if demoting a Super Coordinator, that at least one other one
    // remains) before writing anything. This modal only ever being
    // reachable for a Super Coordinator viewing someone else's row is a
    // UI-level convenience, not the actual security boundary.
    const { error } = await supabase.rpc('update_coordinator_permissions', {
      target_id: coordinator.id,
      new_is_super_coordinator: value.is_super_coordinator,
      new_is_active: value.is_active,
      new_can_create_students: value.can_create_students,
      new_can_edit_students: value.can_edit_students,
      new_can_delete_students: value.can_delete_students,
      new_can_create_hospitals: value.can_create_hospitals,
      new_can_edit_hospitals: value.can_edit_hospitals,
      new_can_delete_hospitals: value.can_delete_hospitals,
      new_can_create_rotations: value.can_create_rotations,
      new_can_edit_rotations: value.can_edit_rotations,
      new_can_delete_rotations: value.can_delete_rotations,
      new_can_manage_attendance: value.can_manage_attendance,
      new_can_review_appeals: value.can_review_appeals,
      new_can_send_announcements: value.can_send_announcements,
      new_can_manage_schedules: value.can_manage_schedules,
      new_can_view_reports: value.can_view_reports,
      new_can_system_settings: value.can_system_settings,
    });
    setSaving(false);

    if (error) {
      showError(error.message);
      return;
    }
    showSuccess(`Permissions updated for ${fullName}.`);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="surface-card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clinical-50 text-clinical-600">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">Permissions — {fullName}</h2>
              <p className="text-sm text-ink-500">Changes take effect immediately.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-300 hover:text-ink-500">
            <X size={18} />
          </button>
        </div>

        <PermissionsFieldset value={value} onChange={setValue} />

        <div className="mt-6 flex gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Save permissions
          </button>
          <button onClick={onClose} disabled={saving} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

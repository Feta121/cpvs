import type { NotificationType, UserRole } from '../types/database';

/**
 * Where clicking a notification of this type should take the user. Kept as
 * a single lookup so push notifications (service worker click) and any
 * future in-app "jump to" affordance stay consistent.
 */
export function notificationTypeToPath(type: NotificationType, role: UserRole): string {
  if (role === 'coordinator') {
    switch (type) {
      case 'attendance_warning':
      case 'late_concern':
        return '/coordinator/attendance';
      case 'appeal_result':
        return '/coordinator/appeals';
      default:
        return '/coordinator/notifications';
    }
  }

  switch (type) {
    case 'attendance_warning':
    case 'late_concern':
      return '/student/history';
    case 'appeal_result':
      return '/student/appeals';
    case 'rotation_update':
    case 'announcement':
    default:
      return '/student/notifications';
  }
}

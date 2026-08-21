export type UserRole = 'student' | 'coordinator';
export type StudentStatus = 'active' | 'completed' | 'past';
export type AttendanceStatus = 'present' | 'late' | 'very_late' | 'absent' | 'excused';
export type AppealStatus = 'pending' | 'approved' | 'rejected';
export type AnnouncementType = 'normal' | 'emergency';
export type NotificationType =
  | 'attendance_warning'
  | 'appeal_result'
  | 'rotation_update'
  | 'announcement'
  | 'late_concern';
export type ExceptionType = 'holiday' | 'closure' | 'cancelled';
export type RotationStatus = 'active' | 'completed' | 'cancelled';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  /** Displayed in the UI as "CPVS ID" — a CPVS-generated code (e.g. "KEDIR-3152"), distinct from the student's actual university ID below. Physical column name kept as-is to avoid renaming an existing column. */
  student_id: string;
  /** Added in migration 0003. Displayed in the UI as "Student ID" — the student's real university-issued ID (e.g. "UGR/3152/15"). */
  university_id: string | null;
  department: string;
  /** Added in migration 0002. Backfilled from `department` for existing rows. */
  program: string | null;
  /** Added in migration 0002. Defaults to 'Addis Ababa University'. */
  institution: string;
  year: number;
  batch: string;
  status: StudentStatus;
  late_attendance_concern: boolean;
  created_at: string;
}

export interface Coordinator {
  id: string;
  department: string | null;
  created_at: string;
  /** Added in migration 0013. The actual CPVS login credential
   * (`<firstname><random>@cpvs.com`) — distinct from profiles.email,
   * which is the coordinator's own personal email. */
  login_email: string;
  /** Added in migration 0012. Bypasses every can_* permission below —
   * only a Super Coordinator can manage other coordinator accounts
   * (create/edit/activate/deactivate/reset password/delete) and change
   * anyone's permissions, including promoting/demoting this flag itself. */
  is_super_coordinator: boolean;
  /** Added in migration 0012. A deactivated coordinator keeps their
   * account and history but loses all coordinator-level access. */
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
  /** Reserved — no page uses this yet. */
  can_view_reports: boolean;
  /** Reserved — no page uses this yet. */
  can_system_settings: boolean;
}

/** All granular (non-super, non-active) permission flags, added in
 * migration 0012. Kept as a standalone type so usePermissions() and the
 * permissions editor UI can iterate over exactly this set without
 * hardcoding the list of keys in more than one place. */
export type PermissionKey =
  | 'can_create_students' | 'can_edit_students' | 'can_delete_students'
  | 'can_create_hospitals' | 'can_edit_hospitals' | 'can_delete_hospitals'
  | 'can_create_rotations' | 'can_edit_rotations' | 'can_delete_rotations'
  | 'can_manage_attendance' | 'can_review_appeals' | 'can_send_announcements'
  | 'can_manage_schedules' | 'can_view_reports' | 'can_system_settings';

export interface Hospital {
  id: string;
  name: string;
  /** Added in migration 0002. Free-text address/location description. */
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  checkin_start_time: string; // "HH:MM:SS"
  /** Added in migration 0003. Coordinator-editable cutoff after which check-in closes and the student becomes eligible for auto-absent. Defaults to 15:00. */
  session_expires_at: string; // "HH:MM:SS"
  /** Added in migration 0002. Inactive hospitals are hidden from new rotation assignment but preserved for history. */
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Rotation {
  id: string;
  student_id: string;
  hospital_id: string;
  coordinator_id: string;
  start_date: string;
  end_date: string;
  status: RotationStatus;
  created_at: string;
}

export interface ScheduleEntry {
  id: string;
  rotation_id: string;
  date: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  rotation_id: string;
  hospital_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  status: AttendanceStatus;
  corrected_by: string | null;
  corrected_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Appeal {
  id: string;
  student_id: string;
  attendance_id: string;
  reason: string;
  file_url: string | null;
  status: AppealStatus;
  coordinator_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  coordinator_id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  target_batch: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  related_id: string | null;
  created_at: string;
}

export interface PracticeException {
  id: string;
  hospital_id: string | null;
  date: string;
  type: ExceptionType;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  /** Added in migration 0005. Null = applies to every batch. */
  batch: string | null;
  /** Added in migration 0005. Null = applies to every student. */
  student_id: string | null;
}

/** Added in migration 0005. The inverse of a practice_exception — adds an
 * extra clinical practice day on a date that wouldn't otherwise count
 * (practice normally only runs Mon/Tue/Wed). */
export interface SpecialPracticeDay {
  id: string;
  date: string;
  hospital_id: string | null;
  batch: string | null;
  student_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

/** Added in migration 0006. Single-row (id is always `true`) coordinator-
 * editable weekly schedule — replaces the previously hardcoded Mon/Tue/Wed. */
export interface ClinicalDaysConfig {
  id: true;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  updated_by: string | null;
  updated_at: string;
}

// Minimal Supabase generic Database shape so `createClient<Database>` type-checks.
// Regenerate with `supabase gen types typescript` once your project is live
// for full compile-time query safety.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      students: { Row: Student; Insert: Partial<Student>; Update: Partial<Student> };
      coordinators: { Row: Coordinator; Insert: Partial<Coordinator>; Update: Partial<Coordinator> };
      hospitals: { Row: Hospital; Insert: Partial<Hospital>; Update: Partial<Hospital> };
      rotations: { Row: Rotation; Insert: Partial<Rotation>; Update: Partial<Rotation> };
      schedules: { Row: ScheduleEntry; Insert: Partial<ScheduleEntry>; Update: Partial<ScheduleEntry> };
      attendance: { Row: AttendanceRecord; Insert: Partial<AttendanceRecord>; Update: Partial<AttendanceRecord> };
      appeals: { Row: Appeal; Insert: Partial<Appeal>; Update: Partial<Appeal> };
      announcements: { Row: Announcement; Insert: Partial<Announcement>; Update: Partial<Announcement> };
      notifications: { Row: NotificationRow; Insert: Partial<NotificationRow>; Update: Partial<NotificationRow> };
      practice_exceptions: { Row: PracticeException; Insert: Partial<PracticeException>; Update: Partial<PracticeException> };
    };
  };
}

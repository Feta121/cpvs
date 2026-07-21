-- ============================================================================
-- CPVS — Clinical Practice Verification System
-- Supabase schema: tables, constraints, indexes, and Row Level Security.
-- Run this once against a fresh Supabase project (SQL Editor -> New query).
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- profiles: one row per auth.users row, shared by both roles
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'coordinator')),
  full_name text not null,
  email text not null,
  phone text,
  photo_url text,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- students: extends profiles for the student role
-- ----------------------------------------------------------------------------
create table if not exists students (
  id uuid primary key references profiles(id) on delete cascade,
  student_id text not null unique,
  department text not null,
  year int not null check (year between 1 and 6),
  batch text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'past')),
  late_attendance_concern boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- coordinators: extends profiles for the coordinator role
-- ----------------------------------------------------------------------------
create table if not exists coordinators (
  id uuid primary key references profiles(id) on delete cascade,
  department text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- hospitals: geofence definitions
-- ----------------------------------------------------------------------------
create table if not exists hospitals (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters int not null default 150,
  checkin_start_time time not null default '09:00',
  created_by uuid references coordinators(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- rotations: assigns a student to a hospital + coordinator for a date range
-- ----------------------------------------------------------------------------
create table if not exists rotations (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  hospital_id uuid not null references hospitals(id),
  coordinator_id uuid not null references coordinators(id),
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint valid_range check (end_date >= start_date)
);

create index if not exists idx_rotations_student on rotations(student_id);
create index if not exists idx_rotations_hospital on rotations(hospital_id);

-- ----------------------------------------------------------------------------
-- schedules: expected clinical days within a rotation (optional granularity)
-- ----------------------------------------------------------------------------
create table if not exists schedules (
  id uuid primary key default uuid_generate_v4(),
  rotation_id uuid not null references rotations(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (rotation_id, date)
);

-- ----------------------------------------------------------------------------
-- attendance: one row per student per clinical day
-- ----------------------------------------------------------------------------
create table if not exists attendance (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  rotation_id uuid not null references rotations(id) on delete cascade,
  hospital_id uuid not null references hospitals(id),
  date date not null,
  check_in_time timestamptz,
  check_out_time timestamptz,
  check_in_lat double precision,
  check_in_lng double precision,
  check_out_lat double precision,
  check_out_lng double precision,
  status text not null check (status in ('present', 'late', 'very_late', 'absent', 'excused')),
  corrected_by uuid references coordinators(id),
  corrected_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (student_id, date)
);

create index if not exists idx_attendance_student_date on attendance(student_id, date);
create index if not exists idx_attendance_rotation on attendance(rotation_id);

-- ----------------------------------------------------------------------------
-- appeals: students appeal an 'absent' attendance record
-- ----------------------------------------------------------------------------
create table if not exists appeals (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  attendance_id uuid not null references attendance(id) on delete cascade,
  reason text not null,
  file_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  coordinator_comment text,
  reviewed_by uuid references coordinators(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- announcements
-- ----------------------------------------------------------------------------
create table if not exists announcements (
  id uuid primary key default uuid_generate_v4(),
  coordinator_id uuid not null references coordinators(id),
  title text not null,
  content text not null,
  type text not null default 'normal' check (type in ('normal', 'emergency')),
  target_batch text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- notifications: per-user inbox
-- ----------------------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null check (type in ('attendance_warning', 'appeal_result', 'rotation_update', 'announcement', 'late_concern')),
  is_read boolean not null default false,
  related_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on notifications(user_id, is_read);

-- ----------------------------------------------------------------------------
-- practice_exceptions: holidays / closures / cancelled days
-- ----------------------------------------------------------------------------
create table if not exists practice_exceptions (
  id uuid primary key default uuid_generate_v4(),
  hospital_id uuid references hospitals(id), -- null = applies to all hospitals
  date date not null,
  type text not null check (type in ('holiday', 'closure', 'cancelled')),
  reason text,
  created_by uuid references coordinators(id),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table profiles enable row level security;
alter table students enable row level security;
alter table coordinators enable row level security;
alter table hospitals enable row level security;
alter table rotations enable row level security;
alter table schedules enable row level security;
alter table attendance enable row level security;
alter table appeals enable row level security;
alter table announcements enable row level security;
alter table notifications enable row level security;
alter table practice_exceptions enable row level security;

-- Helper: is the current user a coordinator?
create or replace function is_coordinator()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coordinator');
$$;

-- profiles: users read their own row; coordinators read all
create policy "profiles_select_own_or_coordinator" on profiles
  for select using (id = auth.uid() or is_coordinator());
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid());
create policy "profiles_insert_coordinator" on profiles
  for insert with check (is_coordinator());

-- students: student reads own row; coordinators manage all
create policy "students_select" on students
  for select using (id = auth.uid() or is_coordinator());
create policy "students_write_coordinator" on students
  for all using (is_coordinator()) with check (is_coordinator());

-- coordinators: readable by all authenticated users (needed to show "current coordinator")
create policy "coordinators_select" on coordinators
  for select using (auth.uid() is not null);
create policy "coordinators_write_self" on coordinators
  for all using (id = auth.uid()) with check (id = auth.uid());

-- hospitals: readable by all; writable by coordinators
create policy "hospitals_select" on hospitals
  for select using (auth.uid() is not null);
create policy "hospitals_write_coordinator" on hospitals
  for all using (is_coordinator()) with check (is_coordinator());

-- rotations: student sees own; coordinator sees/manages all
create policy "rotations_select" on rotations
  for select using (student_id = auth.uid() or is_coordinator());
create policy "rotations_write_coordinator" on rotations
  for all using (is_coordinator()) with check (is_coordinator());

-- schedules: same visibility as rotations
create policy "schedules_select" on schedules
  for select using (
    is_coordinator() or exists (
      select 1 from rotations r where r.id = schedules.rotation_id and r.student_id = auth.uid()
    )
  );
create policy "schedules_write_coordinator" on schedules
  for all using (is_coordinator()) with check (is_coordinator());

-- attendance: student reads/inserts/updates own; coordinator full access
create policy "attendance_select" on attendance
  for select using (student_id = auth.uid() or is_coordinator());
create policy "attendance_insert_own" on attendance
  for insert with check (student_id = auth.uid());
create policy "attendance_update_own_or_coordinator" on attendance
  for update using (student_id = auth.uid() or is_coordinator());

-- appeals: student manages own; coordinator reviews all
create policy "appeals_select" on appeals
  for select using (student_id = auth.uid() or is_coordinator());
create policy "appeals_insert_own" on appeals
  for insert with check (student_id = auth.uid());
create policy "appeals_update_coordinator" on appeals
  for update using (is_coordinator());

-- announcements: readable by all authenticated users; written by coordinators
create policy "announcements_select" on announcements
  for select using (auth.uid() is not null);
create policy "announcements_write_coordinator" on announcements
  for all using (is_coordinator()) with check (is_coordinator());

-- notifications: users see only their own
create policy "notifications_select_own" on notifications
  for select using (user_id = auth.uid());
create policy "notifications_update_own" on notifications
  for update using (user_id = auth.uid());
create policy "notifications_insert_system" on notifications
  for insert with check (true); -- inserted via server-side logic / triggers / coordinator actions

-- practice_exceptions: readable by all; written by coordinators
create policy "exceptions_select" on practice_exceptions
  for select using (auth.uid() is not null);
create policy "exceptions_write_coordinator" on practice_exceptions
  for all using (is_coordinator()) with check (is_coordinator());

-- ============================================================================
-- Storage bucket for appeal attachments
-- ============================================================================
insert into storage.buckets (id, name, public) values ('appeal-files', 'appeal-files', false)
  on conflict (id) do nothing;

create policy "appeal_files_student_upload" on storage.objects
  for insert with check (
    bucket_id = 'appeal-files' and auth.uid() is not null
  );

create policy "appeal_files_read" on storage.objects
  for select using (
    bucket_id = 'appeal-files' and (
      auth.uid() is not null -- refine further if you need per-student isolation
    )
  );

-- ============================================================================
-- Trigger: flag "Late Attendance Concern" after > 4 late/very_late records
-- in a single rotation, and notify both student and coordinator.
-- ============================================================================
create or replace function check_late_attendance_concern()
returns trigger
language plpgsql
security definer
as $$
declare
  late_count int;
  rot rotations%rowtype;
begin
  if new.status in ('late', 'very_late') then
    select count(*) into late_count
    from attendance
    where rotation_id = new.rotation_id
      and student_id = new.student_id
      and status in ('late', 'very_late');

    if late_count > 4 then
      update students set late_attendance_concern = true where id = new.student_id;

      select * into rot from rotations where id = new.rotation_id;

      insert into notifications (user_id, title, message, type, related_id)
      values (
        new.student_id,
        'Late Attendance Concern',
        'You have been flagged for exceeding 4 late attendances in this rotation.',
        'late_concern',
        new.rotation_id
      );

      insert into notifications (user_id, title, message, type, related_id)
      values (
        rot.coordinator_id,
        'Student flagged: Late Attendance Concern',
        'A student in your rotation has exceeded 4 late attendances.',
        'late_concern',
        new.rotation_id
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_late_concern on attendance;
create trigger trg_check_late_concern
  after insert or update on attendance
  for each row execute function check_late_attendance_concern();

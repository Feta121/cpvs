-- ============================================================================
-- Migration 0014 — biometric check-in verification
--
-- WHY: geofencing alone verifies a *device* was at the hospital, not who was
-- holding it — a student can hand their username/password to a friend, who
-- checks in from their own phone inside the geofence. This adds a second,
-- device-bound factor: fingerprint/Face ID via WebAuthn where the device
-- supports it, or a same-person selfie match where it doesn't. Required
-- before a student's first check-in.
--
-- WebAuthn: the private key never leaves the device's secure hardware —
-- CPVS only ever stores the public key. Verification happens by checking a
-- cryptographic signature, not by handling biometric data at all.
--
-- Selfie fallback: face descriptors (128-float vectors from face-api.js,
-- computed client-side) are compared, not raw images matched by a human.
-- The comparison itself happens server-side against the stored reference
-- descriptor, which the client never receives — a tampered client can send
-- a fabricated descriptor, but produces one close enough to the real
-- reference only by having a genuine matching photo, same bar as any
-- face-recognition system.
--
-- NOTE ON students TABLE WRITES: students have NO direct RLS write access
-- to their own row at all (only students_select exists for them; every
-- write policy is coordinator-only, see schema.sql / migration 0012). Every
-- column added below is therefore only ever written by the Edge Functions
-- in this feature, which use the service-role key — never by a client-side
-- update() call. That's intentional, not an oversight.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. WebAuthn credentials — a student may enroll more than one device.
-- ----------------------------------------------------------------------------

create table webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  device_label text,
  created_at timestamptz not null default now()
);

alter table webauthn_credentials enable row level security;

-- Students may READ their own credentials (e.g. to list enrolled devices in
-- Settings) but never write directly — enrollment/removal both go through
-- Edge Functions, same reasoning as the students table itself.
create policy "webauthn_credentials_select_own" on webauthn_credentials
  for select using (student_id = auth.uid());

create policy "webauthn_credentials_select_coordinator" on webauthn_credentials
  for select using (is_coordinator());

-- ----------------------------------------------------------------------------
-- 2. Biometric enrollment fields on students
-- ----------------------------------------------------------------------------

alter table students add column if not exists verification_method text check (verification_method in ('webauthn', 'selfie'));
alter table students add column if not exists reference_face_descriptor jsonb;
alter table students add column if not exists reference_selfie_url text;
alter table students add column if not exists biometric_enrolled_at timestamptz;

-- Temporarily holds the challenge between the two round-trips of a WebAuthn
-- ceremony (options -> verify, for both enrollment and check-in) — a
-- WebAuthn challenge is single-use and must be checked server-side against
-- exactly what was issued, so it needs to live somewhere between requests.
alter table students add column if not exists webauthn_pending_challenge text;

-- A short-lived, single-use pass set only by webauthn-checkin-verify /
-- selfie-verify (both service-role, so a client can't set this itself).
-- The actual attendance insert still happens directly from the client (see
-- src/pages/student/Attendance.tsx) rather than through an Edge Function —
-- this pass is what makes that safe: the RLS policy below refuses the
-- insert unless a recent, unexpired pass exists, so skipping the biometric
-- prompt via devtools and inserting directly no longer works.
alter table students add column if not exists checkin_verification_pass text;
alter table students add column if not exists checkin_verification_pass_expires timestamptz;

-- ----------------------------------------------------------------------------
-- 3. Check-in verification evidence on attendance
-- ----------------------------------------------------------------------------

alter table attendance add column if not exists verified_method text check (verified_method in ('webauthn', 'selfie'));
alter table attendance add column if not exists checkin_selfie_url text;
alter table attendance add column if not exists face_match_distance numeric;

-- ----------------------------------------------------------------------------
-- 4. verify_face_match RPC — the actual comparison decision. SECURITY
--    DEFINER so it can read the student's stored reference descriptor
--    without a broad SELECT policy exposing it to anyone else; the
--    reference descriptor is never returned to the caller, only a
--    match/no-match result and the distance (for logging).
-- ----------------------------------------------------------------------------

create or replace function verify_face_match(fresh_descriptor jsonb)
returns table (matched boolean, distance numeric)
language plpgsql
security definer
as $$
declare
  ref jsonb;
  d numeric := 0;
  i int;
  threshold numeric := 0.6; -- face-api.js's own recommended same-person cutoff
begin
  select reference_face_descriptor into ref from students where id = auth.uid();
  if ref is null then
    raise exception 'No enrolled reference photo found for this account.';
  end if;

  for i in 0..127 loop
    d := d + power((fresh_descriptor->>i)::numeric - (ref->>i)::numeric, 2);
  end loop;
  d := sqrt(d);

  return query select (d < threshold), d;
end;
$$;

grant execute on function verify_face_match(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Enforce the verification pass at the database level. This is the part
--    that actually closes the gap — without it, biometric verification
--    would only be a UI step a client could skip entirely by calling
--    supabase.from('attendance').insert() directly (exactly how a
--    determined user could already fake GPS coordinates today, since
--    geofencing itself is presently only checked client-side). CHECK-OUT is
--    intentionally NOT gated here — the threat this addresses is someone
--    else checking IN to fake presence; by check-out time that has already
--    succeeded or not.
-- ----------------------------------------------------------------------------

drop policy if exists "attendance_insert_own" on attendance;
create policy "attendance_insert_own" on attendance
  for insert with check (
    student_id = auth.uid()
    and exists (
      select 1 from students s
      where s.id = auth.uid()
        and s.checkin_verification_pass_expires is not null
        and s.checkin_verification_pass_expires > now()
    )
  );

-- Consumes the pass the moment it's used, so one verification can't be
-- replayed for a second check-in.
create or replace function consume_checkin_verification_pass()
returns trigger
language plpgsql
security definer
as $$
begin
  update students set checkin_verification_pass = null, checkin_verification_pass_expires = null where id = new.student_id;
  return new;
end;
$$;

drop trigger if exists trg_consume_checkin_verification_pass on attendance;
create trigger trg_consume_checkin_verification_pass
  after insert on attendance
  for each row execute function consume_checkin_verification_pass();

-- ----------------------------------------------------------------------------
-- 6. Storage bucket for check-in selfies (selfie-verification path only —
--    WebAuthn never involves a photo at all). Private, like appeal-files;
--    paths are namespaced by student ID (`<student_id>/<timestamp>.jpg`),
--    so the read policy can check that prefix directly rather than needing
--    a broader "any authenticated user" policy the way appeal-files uses —
--    this is more sensitive material (a person's face tied to a specific
--    day/time), so it's scoped to the student themselves and coordinators
--    only.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('checkin-selfies', 'checkin-selfies', false)
  on conflict (id) do nothing;

create policy "checkin_selfies_upload" on storage.objects
  for insert with check (
    bucket_id = 'checkin-selfies' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "checkin_selfies_read" on storage.objects
  for select using (
    bucket_id = 'checkin-selfies' and (
      auth.uid()::text = (storage.foldername(name))[1] or is_coordinator()
    )
  );

-- Verification (as a student who hasn't enrolled yet):
--   select * from verify_face_match('[0.1, 0.2, ...]'::jsonb);
--   -- raises "No enrolled reference photo found for this account."
--
-- Verification (as a student with no recent verification pass):
--   insert into attendance (student_id, rotation_id, hospital_id, date, status)
--     values (auth.uid(), '...', '...', current_date, 'present');
--   -- fails: new row violates row-level security policy "attendance_insert_own"

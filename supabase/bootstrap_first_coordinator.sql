-- ============================================================================
-- CPVS — create the FIRST Super Coordinator (bootstrap)
--
-- WHY YOU NEED THIS FILE
--
-- The app is deliberately built so that:
--   * only a Super Coordinator can create other coordinators, and
--   * only a coordinator can create students.
--
-- On a database that already had one coordinator, migration 0012 found that
-- person and promoted them automatically. On a BRAND-NEW EMPTY database there
-- is nobody to promote — 0012 runs fine but changes zero rows. That leaves a
-- chicken-and-egg problem: you cannot log in to create the first account,
-- because creating accounts requires already being logged in.
--
-- This file breaks that deadlock exactly once. After running it you log in
-- normally and create everyone else from inside the app.
--
-- ----------------------------------------------------------------------------
-- HOW TO USE IT — three steps, in this order
-- ----------------------------------------------------------------------------
--
-- STEP 1 — create the login in the Supabase dashboard
--   Authentication -> Users -> Add user
--     Email:    admin@cpvs.com
--     Password: choose one and write it down
--     Tick:     "Auto Confirm User"     <-- important, or you cannot log in
--   Click "Create user".
--
--   Why @cpvs.com: the login screen turns whatever username you type into
--   "<username>@cpvs.com" behind the scenes (src/context/AuthContext.tsx).
--   So an account created as admin@cpvs.com is reached by simply typing
--   "admin" as the username.
--
-- STEP 2 — if you used a different email or want a different display name,
--   edit the two marked lines below. Otherwise change nothing.
--
-- STEP 3 — Supabase dashboard -> SQL Editor -> New query.
--   Paste this whole file in, click Run. You should see a green "Success"
--   and a notice confirming the account is ready.
--
-- ----------------------------------------------------------------------------
-- WHEN TO RUN IT
-- ----------------------------------------------------------------------------
-- AFTER migration 0013 at the earliest (that migration adds the required
-- `login_email` column). Running it after 0015 is fine and recommended —
-- 0015's new protection trigger deliberately ignores the SQL Editor, because
-- there is no logged-in user there for it to protect against.
--
-- Safe to run more than once: it updates the existing rows rather than
-- failing on a duplicate.
-- ============================================================================

do $$
declare
  -- ======== EDIT THESE TWO LINES IF YOU NEED TO, THEN LEAVE THE REST ========
  v_login_email text := 'admin@cpvs.com';      -- must match STEP 1 exactly
  v_full_name   text := 'CPVS Administrator';  -- the name shown in the app
  -- =========================================================================

  v_uid uuid;
begin
  -- Look the account up by email so you never have to copy a UUID by hand.
  select id into v_uid
  from auth.users
  where lower(email) = lower(v_login_email);

  if v_uid is null then
    raise exception
      'No login found for "%". Do STEP 1 first: Authentication -> Users -> Add user, with that exact email and "Auto Confirm User" ticked. Then run this file again.',
      v_login_email;
  end if;

  -- ------------------------------------------------------------------
  -- 1. The shared profile row. `role` is what marks this account as a
  --    coordinator rather than a student.
  --
  --    must_change_password is set to false because you chose the password
  --    yourself in STEP 1 — there is nothing to rotate. Every account
  --    created later through the app gets `true` instead, so those users are
  --    forced to replace their temporary password on first login.
  -- ------------------------------------------------------------------
  insert into profiles (id, role, full_name, email, must_change_password)
  values (v_uid, 'coordinator', v_full_name, v_login_email, false)
  on conflict (id) do update set
    role                 = 'coordinator',
    full_name            = excluded.full_name,
    email                = excluded.email,
    must_change_password = false;

  -- ------------------------------------------------------------------
  -- 2. The coordinator row, with every permission granted.
  --
  --    is_super_coordinator = true is the important one: it makes
  --    has_permission() return true for everything (migration 0012), which
  --    is what lets this account create the first real coordinators and
  --    students. The 15 individual can_* flags are set true as well so the
  --    account behaves identically even if it is ever demoted from Super.
  --
  --    login_email is NOT NULL (migration 0013) and must match the address
  --    in auth.users — the Coordinators page displays it as the username to
  --    hand out, and the password-reset flow reads it.
  -- ------------------------------------------------------------------
  insert into coordinators (
    id, department, login_email, is_active, is_super_coordinator,
    can_create_students,   can_edit_students,   can_delete_students,
    can_create_hospitals,  can_edit_hospitals,  can_delete_hospitals,
    can_create_rotations,  can_edit_rotations,  can_delete_rotations,
    can_manage_attendance, can_review_appeals,  can_send_announcements,
    can_manage_schedules,  can_view_reports,    can_system_settings
  ) values (
    v_uid, 'Administration', v_login_email, true, true,
    true, true, true,
    true, true, true,
    true, true, true,
    true, true, true,
    true, true, true
  )
  on conflict (id) do update set
    login_email            = excluded.login_email,
    is_active              = true,
    is_super_coordinator   = true,
    can_create_students    = true, can_edit_students    = true, can_delete_students    = true,
    can_create_hospitals   = true, can_edit_hospitals   = true, can_delete_hospitals   = true,
    can_create_rotations   = true, can_edit_rotations   = true, can_delete_rotations   = true,
    can_manage_attendance  = true, can_review_appeals   = true, can_send_announcements = true,
    can_manage_schedules   = true, can_view_reports     = true, can_system_settings    = true;

  raise notice 'Done. Log in with the part before the @ as your username: "%"',
    split_part(v_login_email, '@', 1);
end $$;


-- ============================================================================
-- CHECK IT WORKED — run this on its own afterwards. You want exactly one row,
-- with role = coordinator and both flags true.
-- ============================================================================
-- select p.full_name,
--        p.role,
--        c.login_email,
--        c.is_active,
--        c.is_super_coordinator
-- from coordinators c
-- join profiles p on p.id = c.id;

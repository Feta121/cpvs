# CPVS — Clinical Practice Verification System

A university clinical practice attendance system for medical students and coordinators, with GPS-geofenced check-in, appeals, rotations, and announcements.

**Stack:** React + TypeScript + Vite, Tailwind CSS, Supabase (Auth, Postgres, Storage, Edge Functions).

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In **Project Settings → API**, copy your **Project URL** and **anon public key**.

## 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

## 3. Run the database schema

In the Supabase dashboard, open **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, and run it. This creates all 11 tables, indexes, Row Level Security policies, the `appeal-files` storage bucket, and the trigger that auto-flags "Late Attendance Concern" after 4+ late records in a rotation.

Also create a second public storage bucket named **`profile-photos`** (used for student profile pictures) — Storage → New bucket → name it `profile-photos`, mark it **public**.

## 4. Deploy the `create-student` Edge Function

Student accounts are created by coordinators, but creating an Auth user requires the **service role key**, which must never reach the browser. That logic lives in a Supabase Edge Function.

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy create-student
```

The function automatically has access to `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in its runtime — no extra config needed.

## 5. Create your first coordinator account

The app has no signup form (as specified) and no admin role — the very first coordinator must be created manually:

1. In Supabase dashboard → **Authentication → Users → Add user**, create a user with an email like `coordinator1@cpvs.local` and a password.
2. In **SQL Editor**, run:
   ```sql
   insert into profiles (id, role, full_name, email, must_change_password)
   values ('<the-user-uuid-from-step-1>', 'coordinator', 'Dr. Jane Doe', 'coordinator1@cpvs.local', false);

   insert into coordinators (id, department)
   values ('<the-same-user-uuid>', 'Anesthesiology');
   ```
3. Log into the app with username `coordinator1` and the password you set.

From there, that coordinator can add hospitals, assign rotations, and use **Students → Add student** to generate every subsequent student (and additional coordinator, via the same manual SQL step) account.

## 6. Deploy the nightly `mark-absences` job

This closes the loop the manual/GPS check-in path leaves open: any student in an active rotation who didn't check in on an expected clinical day gets marked `absent` automatically, unless the date is covered by a `practice_exceptions` entry.

```bash
supabase functions deploy mark-absences
```

Then, in **SQL Editor**, run `supabase/cron.sql` — but first edit the two placeholders inside it:
- `YOUR-PROJECT-REF` → your project ref (from the dashboard URL)
- `YOUR-SERVICE-ROLE` → your `service_role` key (Project Settings → API)

This schedules the function via `pg_cron` + `pg_net` to run nightly at 23:45 UTC. Adjust the cron expression to fit your institution's clinical day and timezone.

**How it decides who's "expected"**: if a rotation has rows in `schedules`, only those exact dates count; otherwise it falls back to every weekday (Mon–Fri) within the rotation's date range. Populate `schedules` per rotation if your program has non-standard clinical days.

You can also invoke it manually for a specific date (useful for backfilling or testing):
```bash
supabase functions invoke mark-absences --body '{"date":"2026-07-18"}'
```

## 7. Apply migration 0003 + deploy delete-student

```
supabase/migrations/0003_session_expiry_and_university_id.sql
```
adds a per-hospital `session_expires_at` (default 15:00) and a `university_id` field on students (displayed as "Student ID" — the pre-existing `student_id` column is now displayed as "CPVS ID"). Run it in the SQL Editor.

Then deploy the new student-deletion function:
```bash
supabase functions deploy delete-student
```
Deleting a student calls this function rather than deleting the `students` row directly — removing the underlying auth user cascades through profiles → students → rotations → attendance/appeals automatically (via the existing `on delete cascade` foreign keys), so nothing is left orphaned.

Re-deploy `create-student` too — it changed (new CPVS ID / username scheme, `@cpvs.com` domain, requires a university ID):
```bash
supabase functions deploy create-student
```

If you already scheduled the old nightly `mark-absences` cron job, replace it — it's no longer a once-a-night job; it now checks each hospital's own `session_expires_at` throughout the day, so it needs to run every 15 minutes:
```sql
select cron.unschedule('cpvs-mark-absences-nightly'); -- if it exists
```
then re-run the updated `supabase/cron.sql`.

## 8. Apply migration 0004 (fixes "(profile missing)" for good)

If students ever show as "(profile missing)" anywhere in the coordinator UI — even ones created through the working Add Student flow — it's almost always the `profiles` table's Row Level Security silently filtering out rows for anyone other than the current user (RLS filtering doesn't error, it just returns fewer rows). Run `supabase/migrations/0004_profiles_rpc_and_notes.sql` in the SQL Editor: it adds a `SECURITY DEFINER` function (`get_profiles_by_ids`) that bypasses RLS entirely and does its own explicit coordinator-or-self check instead, so it works regardless of whatever the live RLS policy state actually is.

## 9. Install and run locally

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

## 10. Deploy

Build with `npm run build`; the static output in `dist/` can be deployed to Vercel, Netlify, Cloudflare Pages, or GitHub Pages. Remember to set the same two `VITE_SUPABASE_*` environment variables in your hosting provider.

---

## How key flows work

- **Login**: students/coordinators sign in with a coordinator-issued username. Internally this maps to a synthetic email (`username@cpvs.local`) so Supabase's built-in email/password auth can be used without exposing real emails.
- **First login**: `profiles.must_change_password` starts `true`; `ProtectedRoute` redirects to `/change-password` until the user sets their own password.
- **GPS check-in**: `src/utils/geofence.ts` computes Haversine distance between the student's device location and the assigned hospital's lat/lng, and compares it to the hospital's configured `radius_meters`. Status (present/late/very_late/session-expired) is derived from the check-in timestamp against the hospital's `checkin_start_time`.
- **Late Attendance Concern**: a Postgres trigger (`check_late_attendance_concern` in `schema.sql`) counts late/very_late rows per rotation and flags the student + notifies both student and coordinator once the count exceeds 4.
- **Appeals**: students may only appeal `absent` records; approving an appeal flips the underlying attendance row to `excused`.
- **Practice exceptions**: holidays/closures/cancellations are recorded per hospital (or globally) — wire your absence-marking job (e.g., a nightly Edge Function or cron) to skip any date present in `practice_exceptions` before creating an `absent` row.

## Folder structure

```
src/
  components/
    layout/AppShell.tsx        shared sidebar + mobile nav shell
    ui/                        Badge, StatCard, FullScreenLoader
    ProtectedRoute.tsx         role-based route guard
  context/AuthContext.tsx      session, profile, role, sign in/out
  lib/supabase.ts              Supabase client singleton
  pages/
    student/                   dashboard, check-in, history, appeals, notifications, profile
    coordinator/                dashboard, students, hospitals, rotations, attendance, appeals, announcements, exceptions
  types/database.ts            hand-written types mirroring the schema
  utils/geofence.ts            Haversine distance + attendance status rules
supabase/
  schema.sql                   full table/RLS/trigger definitions
  functions/create-student/    Edge Function for issuing student credentials
```

## Notes on production-readiness

- No mock/fake data is generated anywhere — every screen reads from and writes to Supabase.
- Regenerate strict types once your schema is live: `supabase gen types typescript --linked > src/types/supabase-generated.ts`, then pass that type into `createClient<Database>()` in `src/lib/supabase.ts` for full compile-time query safety (the current build intentionally omits this generic — see the comment in that file — because a hand-maintained `Partial<T>`-based Database type collapses insert/update calls to `never`).
- Add a scheduled Edge Function (pg_cron or an external scheduler) that walks each active rotation's expected `schedules` dates and inserts `absent` rows for any day with no check-in and no matching `practice_exceptions` entry — this repo wires the manual/GPS check-in path but leaves the "mark absent" nightly job for you to deploy, since its cadence depends on your institution's clinical calendar.

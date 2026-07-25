-- ============================================================================
-- CPVS — schedule the "mark absences" job
--
-- CHANGED: mark-absences no longer only runs once at night for "yesterday" —
-- it now checks, on every call, whether each hospital's own
-- `session_expires_at` cutoff has passed yet today (Africa/Addis_Ababa time)
-- before marking a student absent. Because different hospitals can have
-- different cutoff times, this needs to run frequently throughout the day
-- rather than once, so a student is marked absent shortly after their
-- specific hospital's cutoff — not hours later or the next day.
--
-- Every 5 minutes is pg_cron's practical minimum granularity (it's cron
-- syntax under the hood, which doesn't support sub-minute schedules) — this
-- means a student can be marked absent up to ~5 minutes after their
-- hospital's cutoff, not instantly, but well within "same session, same
-- day" rather than waiting for the day to end.
--
-- Run this in the Supabase SQL Editor AFTER deploying the mark-absences
-- Edge Function (`supabase functions deploy mark-absences`).
--
-- It uses pg_cron (scheduling) + pg_net (HTTP calls from Postgres) — both are
-- available as Supabase extensions. Enable them first under
-- Database -> Extensions if they aren't already on.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- If you previously scheduled the 15-minute version, remove it first so you
-- don't have two jobs running:
--   select cron.unschedule('cpvs-mark-absences-every-15-min');

-- Replace the two placeholders below:
--   YOUR-PROJECT-REF   -> your Supabase project ref (from the dashboard URL)
--   YOUR-SERVICE-ROLE  -> your project's service_role key
--                          (Project Settings -> API -> service_role secret)
select cron.schedule(
  'cpvs-mark-absences-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/mark-absences',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR-SERVICE-ROLE'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect scheduled jobs (and confirm this is actually registered):
--   select * from cron.job;
-- To see its recent run history (confirms it's actually FIRING, not just registered):
--   select * from cron.job_run_details order by start_time desc limit 20;
-- To remove this schedule:
--   select cron.unschedule('cpvs-mark-absences-every-5-min');

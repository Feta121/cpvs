-- ============================================================================
-- Migration 0013 — persist each coordinator's login username
--
-- WHY: coordinators.email on `profiles` is the coordinator's own personal
-- email (a Gmail address, etc.), entered when the account was created.
-- The actual CPVS login credential is a separate, auto-generated
-- `<firstname><random 3 digits>@cpvs.com` address — but that was only ever
-- returned once, in the create-coordinator response, and never persisted
-- anywhere queryable afterward. That's what caused the reset-password flow
-- to display the personal email as if it were the login username — it had
-- no other field to read from.
--
-- This adds `login_email` to `coordinators`, backfilled from the actual
-- auth.users.email for every existing row (the real, authoritative login
-- credential, regardless of what profiles.email happens to be) so this
-- works correctly for the already-promoted Super Coordinator too, not just
-- coordinators created after this migration.
-- ============================================================================

alter table coordinators add column if not exists login_email text;

update coordinators c
set login_email = u.email
from auth.users u
where u.id = c.id and c.login_email is null;

-- Every row should now have one (every coordinator has a corresponding
-- auth.users row by definition — that's how they log in at all).
alter table coordinators alter column login_email set not null;

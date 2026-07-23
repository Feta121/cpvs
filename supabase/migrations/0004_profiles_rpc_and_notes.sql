-- ============================================================================
-- Migration 0004 — robust profile lookups via RPC
--
-- WHY: coordinators were seeing "(profile missing)" for every student across
-- every page — including students created through the correct, fully-working
-- creation flow. The client-side fix (fetching profiles in a flat query
-- instead of a nested embed) was correct in principle, but a direct
-- `select * from profiles where id in (...)` is still subject to whatever
-- RLS policy is actually active on the live database — and RLS filtering
-- doesn't raise an error, it just silently returns fewer/no rows. That
-- produces exactly this symptom: no error toast, just permanently blank
-- profiles for everyone.
--
-- FIX: a SECURITY DEFINER function bypasses RLS entirely (it runs with the
-- privileges of its owner, not the calling user), so it's immune to however
-- profiles' RLS policies are — or aren't — currently configured. The
-- authorization check happens explicitly inside the function instead:
-- coordinators get every requested profile back; anyone else only ever gets
-- their own, no matter what ids they pass in.
--
-- SAFETY: purely additive — a new function, no table/column changes, no
-- data touched.
-- ============================================================================

create or replace function get_profiles_by_ids(ids uuid[])
returns setof profiles
language plpgsql
security definer
stable
as $$
begin
  if is_coordinator() then
    return query select * from profiles where id = any(ids);
  else
    -- Non-coordinators can only ever get their own profile back, even if
    -- they pass other ids — safe to expose to any authenticated user.
    return query select * from profiles where id = auth.uid();
  end if;
end;
$$;

grant execute on function get_profiles_by_ids(uuid[]) to authenticated;

-- Verification (run as any authenticated coordinator):
--   select * from get_profiles_by_ids(array(select id from students limit 5));
-- Should return real rows with full_name populated, regardless of the
-- profiles table's current RLS policy state.

import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

/**
 * Fetches profiles for a set of ids and returns them as a Map for merging.
 *
 * WHY THIS EXISTS: pages were using double-nested Supabase embeds like
 * `rotations(*, student:students(*, profile:profiles(*)))`. That's a
 * two-hop embed (rotations -> students -> profiles), and it kept coming
 * back null for `profile` even when the row genuinely existed. Flattening
 * to a single-table query fixed some cases, but a plain
 * `select * from profiles where id in (...)` is still subject to RLS —
 * and RLS filtering doesn't error, it just silently returns fewer rows,
 * which looked identical to "the profile doesn't exist." This now calls
 * `get_profiles_by_ids`, a SECURITY DEFINER Postgres function (migration
 * 0004) that bypasses RLS entirely and does its own explicit
 * coordinator-or-self authorization check instead — immune to however
 * profiles' RLS policies are (or aren't) currently configured.
 */
export async function fetchProfilesById(ids: (string | null | undefined)[]): Promise<Map<string, Profile>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => !!id)));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase.rpc('get_profiles_by_ids', { ids: uniqueIds });
  if (error) throw error;

  const map = new Map<string, Profile>();
  (data ?? []).forEach((p: Profile) => map.set(p.id, p));
  return map;
}

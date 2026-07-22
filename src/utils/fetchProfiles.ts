import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

/**
 * Fetches profiles for a set of ids and returns them as a Map for merging.
 *
 * WHY THIS EXISTS: pages were using double-nested Supabase embeds like
 * `rotations(*, student:students(*, profile:profiles(*)))`. That's a
 * two-hop embed (rotations -> students -> profiles), and it kept coming
 * back null for `profile` even when the row genuinely existed — regardless
 * of the actual cause (RLS evaluation order, embedding depth, or how
 * PostgREST resolves the students<->profiles relationship when it's a
 * shared primary key two levels deep), the fix is to stop depending on it.
 * Fetching profiles in a flat, single-table query and merging client-side
 * has no such ambiguity: it's just `select * from profiles where id in (...)`.
 */
export async function fetchProfilesById(ids: (string | null | undefined)[]): Promise<Map<string, Profile>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => !!id)));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase.from('profiles').select('*').in('id', uniqueIds);
  if (error) throw error;

  const map = new Map<string, Profile>();
  (data ?? []).forEach((p) => map.set(p.id, p));
  return map;
}

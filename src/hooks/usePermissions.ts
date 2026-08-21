import { useAuth } from '../context/AuthContext';
import type { PermissionKey } from '../types/database';

/**
 * Client-side mirror of the has_permission()/is_super_coordinator() SQL
 * functions from migration 0012. This is what drives hiding nav items and
 * action buttons in the UI — it is NOT the actual security boundary (RLS +
 * the SECURITY DEFINER functions/triggers are, since this hook can't stop
 * anyone from calling the Supabase API directly). Every mutating action
 * gated here is also independently gated at the database level.
 */
export function usePermissions() {
  const { coordinator } = useAuth();

  const isActive = coordinator?.is_active !== false;
  const isSuper = isActive && !!coordinator?.is_super_coordinator;

  function has(key: PermissionKey): boolean {
    if (!coordinator || !isActive) return false;
    if (isSuper) return true;
    return !!coordinator[key];
  }

  function hasAny(keys: PermissionKey[]): boolean {
    return keys.some(has);
  }

  return { isSuper, isActive, has, hasAny };
}

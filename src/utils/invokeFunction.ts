import { supabase } from '../lib/supabase';

/**
 * Wraps supabase.functions.invoke() to fix a real gotcha: when an Edge
 * Function returns any non-2xx status, supabase-js puts a generic
 * "Edge Function returned a non-2xx status code" in `error.message` and
 * `data` comes back null — even though the function's actual JSON body
 * (e.g. `{ error: "Only coordinators can delete student accounts." }`) is
 * right there, just not surfaced automatically. The real body is reachable
 * via `error.context`, which is the raw Response object — this reads it and
 * returns the specific message instead of the generic one.
 *
 * This is very likely the reason several past "it's not working" issues
 * were hard to diagnose — every failure path in create-student,
 * delete-student, and mark-absences returns a specific, helpful message,
 * but it was being silently swallowed and replaced with a generic string
 * before reaching the UI.
 */
export async function invokeEdgeFunction<T = any>(
  name: string,
  body: Record<string, unknown> = {}
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsedBody = await ctx.clone().json();
        if (parsedBody?.error) return { data: null, error: parsedBody.error };
      } catch {
        // Body wasn't JSON (e.g. a network-level failure) — fall through
        // to the generic message below.
      }
    }
    return { data: null, error: error.message };
  }

  const payloadError = (data as any)?.error;
  if (payloadError) return { data: null, error: payloadError };

  return { data, error: null };
}

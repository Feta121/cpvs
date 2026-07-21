import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at startup rather than silently querying a broken client.
  // Fill these in your .env.local — see README for setup steps.
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Create a .env.local file — see README.md.'
  );
}

// NOTE: intentionally untyped against the `Database` generic. The hand-written
// types in src/types/database.ts describe table shapes for use in component
// props, but supabase-js's generic Insert/Update inference needs full,
// non-Partial Row/Insert/Update definitions or it collapses to `never`.
// Once your project is live, run `supabase gen types typescript --linked`
// and pass the generated type here for full compile-time query safety.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

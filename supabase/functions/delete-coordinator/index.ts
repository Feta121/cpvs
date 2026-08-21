// Supabase Edge Function: delete-coordinator
//
// Added in migration 0012. Mirrors delete-student's structure (deleting the
// auth.users row cascades through profiles -> coordinators automatically),
// with two extra checks specific to coordinators, both required by spec:
//   1. A coordinator can never delete their own account.
//   2. The last remaining active Super Coordinator can never be deleted —
//      there must always be at least one way back in.
// Both checks happen here (service-role key bypasses RLS) rather than
// relying on RLS alone, since RLS has no policy for this table's DELETE at
// all — deletion only ever happens through this function.
//
// Deploy with:
//   supabase functions deploy delete-coordinator

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header. Please log in again.' }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Your session has expired. Please log in again.' }, 401);

    const { data: callerCoordinator, error: callerCoordinatorError } = await admin
      .from('coordinators')
      .select('is_active, is_super_coordinator')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (callerCoordinatorError) return json({ error: 'Unable to verify your permissions. ' + callerCoordinatorError.message }, 500);
    if (!callerCoordinator?.is_active || !callerCoordinator.is_super_coordinator) {
      return json({ error: 'Only an active Super Coordinator can delete coordinator accounts.' }, 403);
    }

    const body = await req.json().catch(() => null);
    const coordinatorId = body?.coordinatorId;
    if (!coordinatorId) return json({ error: 'Missing coordinator id.' }, 400);

    if (coordinatorId === userData.user.id) {
      return json({ error: 'You cannot delete your own account.' }, 400);
    }

    const { data: target, error: targetError } = await admin
      .from('coordinators')
      .select('is_super_coordinator, is_active')
      .eq('id', coordinatorId)
      .maybeSingle();
    if (targetError) return json({ error: 'Unable to look up that coordinator. ' + targetError.message }, 500);
    if (!target) return json({ error: 'Coordinator not found.' }, 404);

    if (target.is_super_coordinator) {
      const { count, error: countError } = await admin
        .from('coordinators')
        .select('id', { count: 'exact', head: true })
        .eq('is_super_coordinator', true)
        .eq('is_active', true)
        .neq('id', coordinatorId);
      if (countError) return json({ error: 'Unable to verify remaining Super Coordinators. ' + countError.message }, 500);
      if (!count || count === 0) {
        return json({ error: 'Cannot delete the last Super Coordinator.' }, 400);
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(coordinatorId);
    if (deleteError) return json({ error: 'Unable to delete coordinator. ' + deleteError.message }, 500);

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unable to delete coordinator. An unexpected error occurred.' }, 500);
  }
});

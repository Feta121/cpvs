// Supabase Edge Function: reset-coordinator-password
//
// Added in migration 0012. There was no password-reset capability for
// ANY role before this (students/coordinators only ever set their own via
// ChangePassword). This generates a fresh temp password server-side, sets
// it via the Admin API, and flips must_change_password back to true so the
// coordinator is forced to pick their own on next login — same pattern as
// account creation. The new temp password is returned once in the response
// for the Super Coordinator to relay; it is never stored anywhere.
//
// Self-reset is intentionally blocked here too — an active Super
// Coordinator (or any coordinator) who wants to change their own password
// already has that via Settings -> Change password, which doesn't require
// this elevated, service-role-backed path at all.
//
// Deploy with:
//   supabase functions deploy reset-coordinator-password

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

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
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
      return json({ error: 'Only an active Super Coordinator can reset coordinator passwords.' }, 403);
    }

    const body = await req.json().catch(() => null);
    const coordinatorId = body?.coordinatorId;
    if (!coordinatorId) return json({ error: 'Missing coordinator id.' }, 400);

    if (coordinatorId === userData.user.id) {
      return json({ error: 'Use Settings → Change password to change your own password.' }, 400);
    }

    const tempPassword = generateTempPassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(coordinatorId, { password: tempPassword });
    if (updateError) return json({ error: 'Unable to reset password. ' + updateError.message }, 500);

    const { error: profileError } = await admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', coordinatorId);
    if (profileError) return json({ error: 'Password was reset, but flagging the account for a mandatory change failed: ' + profileError.message }, 500);

    return json({ tempPassword });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unable to reset password. An unexpected error occurred.' }, 500);
  }
});

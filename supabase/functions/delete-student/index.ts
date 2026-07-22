// Supabase Edge Function: delete-student
//
// Deleting a student is destructive by nature (it cascades through
// rotations, attendance, and appeals — see schema.sql's `on delete cascade`
// foreign keys), which is exactly why the client shows a strict, specific
// warning before calling this. This function itself just does the deletion
// correctly: removing the auth.users row (which only the service role can
// do) cascades automatically through profiles -> students -> rotations ->
// attendance/appeals, so the student's login, profile, and all clinical
// records are removed together, instead of deleting only the `students` row
// via RLS and leaving an orphaned login behind.
//
// Deploy with:
//   supabase functions deploy delete-student
//
// Invoke from the client with:
//   supabase.functions.invoke('delete-student', { body: { studentId } })

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

    const { data: callerProfile, error: callerProfileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (callerProfileError) return json({ error: 'Unable to verify your account role. ' + callerProfileError.message }, 500);
    if (callerProfile?.role !== 'coordinator') return json({ error: 'Only coordinators can delete student accounts.' }, 403);

    const body = await req.json().catch(() => null);
    const studentId = body?.studentId;
    if (!studentId) return json({ error: 'Missing student id.' }, 400);

    const { error: deleteError } = await admin.auth.admin.deleteUser(studentId);
    if (deleteError) return json({ error: 'Unable to delete student. ' + deleteError.message }, 500);

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unable to delete student. An unexpected error occurred.' }, 500);
  }
});

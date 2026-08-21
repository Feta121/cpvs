// Supabase Edge Function: create-coordinator
//
// Added in migration 0012 (hierarchical coordinator permissions). Mirrors
// create-student's structure closely, with two differences:
//   1. Only an active Super Coordinator may call this (checked explicitly
//      below — this function uses the service-role key, so it bypasses
//      RLS, meaning this check IS the real enforcement, not just a UX
//      nicety).
//   2. The Super Coordinator sets the new account's initial permissions
//      (including, optionally, Super Coordinator status itself) as part of
//      the same request, since the permissions UI edits everything
//      together as one form.
//
// Username/login-email scheme: coordinators don't have a university ID the
// way students do, so the username is just firstname + a random 3-digit
// number, checked for collision (e.g. "kedir482"), logging in as
// kedir482@cpvs.com — same @cpvs.com convention as students.
//
// Deploy with:
//   supabase functions deploy create-coordinator

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

function extractFirstName(fullName: string) {
  return (fullName.trim().split(/\s+/)[0] || 'coordinator').replace(/[^a-zA-Z]/g, '');
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

  let createdUserId: string | null = null;

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
      return json({ error: 'Only an active Super Coordinator can create coordinator accounts.' }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Invalid request. Please try again.' }, 400);

    const { fullName, email, phone, department, permissions } = body as {
      fullName?: string;
      email?: string;
      phone?: string;
      department?: string;
      permissions?: Record<string, boolean>;
    };

    if (!fullName?.trim()) return json({ error: 'Unable to add coordinator. Missing required field: full name.' }, 400);

    const firstName = extractFirstName(fullName);
    let username = `${firstName.toLowerCase()}${Math.floor(100 + Math.random() * 900)}`;

    // Handle the (rare) username collision by regenerating with a fresh
    // random number, up to a few tries, instead of failing outright.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing } = await admin.from('profiles').select('id').eq('email', `${username}@cpvs.com`).maybeSingle();
      if (!existing) break;
      username = `${firstName.toLowerCase()}${Math.floor(100 + Math.random() * 900)}`;
    }

    const tempPassword = generateTempPassword();
    const loginEmail = `${username}@cpvs.com`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: loginEmail,
      password: tempPassword,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      return json({ error: 'Unable to create coordinator login. ' + (createError?.message ?? 'Unknown error.') }, 500);
    }
    createdUserId = created.user.id;

    const { error: profileError } = await admin.from('profiles').insert({
      id: createdUserId,
      role: 'coordinator',
      full_name: fullName.trim(),
      email: email?.trim() || loginEmail,
      phone: phone?.trim() || null,
      must_change_password: true,
    });
    if (profileError) throw new Error('Unable to create coordinator profile. ' + profileError.message);

    // Every flag defaults to false (least privilege) unless explicitly set
    // true in the request — matches every other newly-created coordinator
    // starting with nothing granted until a Super Coordinator grants it.
    const perm = (key: string) => !!permissions?.[key];

    const { error: coordinatorError } = await admin.from('coordinators').insert({
      id: createdUserId,
      department: department?.trim() || null,
      is_active: true,
      is_super_coordinator: perm('is_super_coordinator'),
      can_create_students: perm('can_create_students'),
      can_edit_students: perm('can_edit_students'),
      can_delete_students: perm('can_delete_students'),
      can_create_hospitals: perm('can_create_hospitals'),
      can_edit_hospitals: perm('can_edit_hospitals'),
      can_delete_hospitals: perm('can_delete_hospitals'),
      can_create_rotations: perm('can_create_rotations'),
      can_edit_rotations: perm('can_edit_rotations'),
      can_delete_rotations: perm('can_delete_rotations'),
      can_manage_attendance: perm('can_manage_attendance'),
      can_review_appeals: perm('can_review_appeals'),
      can_send_announcements: perm('can_send_announcements'),
      can_manage_schedules: perm('can_manage_schedules'),
      can_view_reports: perm('can_view_reports'),
      can_system_settings: perm('can_system_settings'),
    });
    if (coordinatorError) throw new Error('Unable to create coordinator record. ' + coordinatorError.message);

    return json({ username, tempPassword, loginEmail });
  } catch (err) {
    if (createdUserId) {
      await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
    }
    return json({ error: (err as Error).message ?? 'Unable to add coordinator. An unexpected error occurred.' }, 500);
  }
});

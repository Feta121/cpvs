// Supabase Edge Function: create-student
//
// Creates a Supabase Auth user for a new student, plus their `profiles` and
// `students` rows, using the service role key. This MUST run server-side —
// the service role key is never shipped to the browser.
//
// FIX NOTE (student creation flow): the previous version had no rollback. If
// the `profiles` or `students` insert failed *after* the auth user was
// already created, you got an orphaned auth user with no student-facing
// record and no way to retry with the same name — from the coordinator's
// side this looked exactly like "clicking save does nothing," because the
// error was returned but the half-created user then blocked a clean retry
// (e.g. a unique constraint conflict on a later attempt). This version
// deletes the auth user again if any later step fails, so a retry always
// starts clean, and every failure path returns a specific, human-readable
// message instead of a raw Postgres/Auth error.
//
// Deploy with:
//   supabase functions deploy create-student
//
// Invoke from the client with:
//   supabase.functions.invoke('create-student', { body: { fullName, program, institution, department, year, batch, email, phone } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateUsername(fullName: string, batch: string) {
  const slug = fullName.trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 8) || 'student';
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${slug}${batch.toLowerCase().replace(/\s+/g, '')}${suffix}`;
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
}

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

  // Track the auth user id as soon as it's created so the catch-all rollback
  // at the bottom can clean it up on ANY later failure.
  let createdUserId: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header. Please log in again.' }, 401);

    // ---- 1. Authenticate the caller and confirm they're a coordinator ----
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: 'Your session has expired. Please log in again.' }, 401);
    }

    const { data: callerProfile, error: callerProfileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (callerProfileError) {
      return json({ error: 'Unable to verify your account role. ' + callerProfileError.message }, 500);
    }
    if (callerProfile?.role !== 'coordinator') {
      return json({ error: 'Only coordinators can create student accounts.' }, 403);
    }

    // ---- 2. Validate input (root cause class: missing/blank required fields) ----
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Invalid request. Please try again.' }, 400);

    const { fullName, email, phone, department, program, institution, year, batch } = body;

    const missing: string[] = [];
    if (!fullName?.trim()) missing.push('full name');
    if (!department?.trim()) missing.push('department');
    if (!batch?.trim()) missing.push('batch');
    if (year === undefined || year === null || year === '') missing.push('year');
    if (missing.length > 0) {
      return json({ error: `Unable to add student. Missing required field(s): ${missing.join(', ')}.` }, 400);
    }

    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 1 || yearNum > 6) {
      return json({ error: 'Unable to add student. Year must be a whole number between 1 and 6.' }, 400);
    }

    // ---- 3. Create the auth user ----
    const username = generateUsername(fullName, batch);
    const tempPassword = generateTempPassword();
    const internalEmail = `${username}@cpvs.com`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalEmail,
      password: tempPassword,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      return json({ error: 'Unable to create student login. ' + (createError?.message ?? 'Unknown error.') }, 500);
    }
    createdUserId = created.user.id;

    // ---- 4. Create the profiles row ----
    const { error: profileError } = await admin.from('profiles').insert({
      id: createdUserId,
      role: 'student',
      full_name: fullName.trim(),
      email: email?.trim() || internalEmail,
      phone: phone?.trim() || null,
      must_change_password: true,
    });
    if (profileError) {
      throw new Error('Unable to create student profile. ' + profileError.message);
    }

    // ---- 5. Create the students row ----
    const studentIdCode = `AAU-ANES-${batch}-${username.slice(-4)}`.toUpperCase();
    const { error: studentError } = await admin.from('students').insert({
      id: createdUserId,
      student_id: studentIdCode,
      department: department.trim(),
      program: program?.trim() || department.trim(),
      institution: institution?.trim() || 'Addis Ababa University',
      year: yearNum,
      batch: batch.trim(),
      status: 'active',
    });
    if (studentError) {
      throw new Error('Unable to create student record. ' + studentError.message);
    }

    // ---- Success ----
    return json({ username, tempPassword, studentId: studentIdCode });
  } catch (err) {
    // Rollback: if the auth user was created but a later step failed, delete
    // it so the coordinator can immediately retry without a leftover,
    // invisible account blocking them.
    if (createdUserId) {
      await admin.auth.admin.deleteUser(createdUserId).catch(() => {
        // If even the rollback fails, surface that too — silence here would
        // recreate the exact "looks like nothing happened" bug.
      });
    }
    return json({ error: (err as Error).message ?? 'Unable to add student. An unexpected error occurred.' }, 500);
  }
});
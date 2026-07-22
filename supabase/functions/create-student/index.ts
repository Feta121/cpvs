// Supabase Edge Function: create-student
//
// ID SCHEME (per spec):
//   - "Student ID" (stored in `university_id`) is the real university-issued
//     ID the coordinator types in, e.g. "UGR/3152/15".
//   - "CPVS ID" (stored in `student_id`, the pre-existing column — kept as-is
//     to avoid renaming it) is generated as FIRSTNAME-NUMBER, where NUMBER is
//     the numeric segment of the university ID. "Kedir Hassen" + "UGR/3152/15"
//     -> "KEDIR-3152".
//   - Username (and therefore login email) is the lowercase version of the
//     same thing: "kedir3152", logging in as kedir3152@cpvs.com.
//   - On a collision (e.g. two "Kedir"s with different university IDs that
//     happen to share a number, or a genuine duplicate), a short random
//     suffix is appended so account creation never silently fails.
//
// Deploy with:
//   supabase functions deploy create-student

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
  return (fullName.trim().split(/\s+/)[0] || 'student').replace(/[^a-zA-Z]/g, '');
}

/** Pulls the numeric segment out of a university ID like "UGR/3152/15" -> "3152". */
function extractIdNumber(universityId: string) {
  const parts = universityId.split('/').map((p) => p.trim());
  const numeric = parts.find((p) => /^\d+$/.test(p));
  return numeric ?? String(Math.floor(1000 + Math.random() * 9000));
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

    const { data: callerProfile, error: callerProfileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (callerProfileError) return json({ error: 'Unable to verify your account role. ' + callerProfileError.message }, 500);
    if (callerProfile?.role !== 'coordinator') return json({ error: 'Only coordinators can create student accounts.' }, 403);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Invalid request. Please try again.' }, 400);

    const { fullName, email, phone, department, program, institution, year, batch, universityId } = body;

    const missing: string[] = [];
    if (!fullName?.trim()) missing.push('full name');
    if (!universityId?.trim()) missing.push('student ID (university ID)');
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

    // Reject a duplicate university ID up front with a clear message, rather
    // than surfacing a raw unique-constraint error after the auth user (and
    // temp password) has already been generated.
    const { data: existingUniId } = await admin
      .from('students')
      .select('id')
      .eq('university_id', universityId.trim())
      .maybeSingle();
    if (existingUniId) {
      return json({ error: `Unable to add student. A student with Student ID "${universityId.trim()}" already exists.` }, 409);
    }

    const firstName = extractFirstName(fullName);
    const idNumber = extractIdNumber(universityId.trim());
    let cpvsId = `${firstName.toUpperCase()}-${idNumber}`;
    let username = `${firstName.toLowerCase()}${idNumber}`;

    // Handle the (rare) case where the generated username/CPVS ID collides
    // with an existing one by appending a short random suffix, instead of
    // failing outright.
    const { data: existingCode } = await admin.from('students').select('id').eq('student_id', cpvsId).maybeSingle();
    if (existingCode) {
      const suffix = Math.floor(10 + Math.random() * 90);
      cpvsId = `${cpvsId}-${suffix}`;
      username = `${username}${suffix}`;
    }

    const tempPassword = generateTempPassword();
    const loginEmail = `${username}@cpvs.com`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: loginEmail,
      password: tempPassword,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      return json({ error: 'Unable to create student login. ' + (createError?.message ?? 'Unknown error.') }, 500);
    }
    createdUserId = created.user.id;

    const { error: profileError } = await admin.from('profiles').insert({
      id: createdUserId,
      role: 'student',
      full_name: fullName.trim(),
      email: email?.trim() || loginEmail,
      phone: phone?.trim() || null,
      must_change_password: true,
    });
    if (profileError) throw new Error('Unable to create student profile. ' + profileError.message);

    const { error: studentError } = await admin.from('students').insert({
      id: createdUserId,
      student_id: cpvsId,
      university_id: universityId.trim(),
      department: department.trim(),
      program: program?.trim() || department.trim(),
      institution: institution?.trim() || 'Addis Ababa University',
      year: yearNum,
      batch: batch.trim(),
      status: 'active',
    });
    if (studentError) throw new Error('Unable to create student record. ' + studentError.message);

    return json({ username, tempPassword, cpvsId, universityId: universityId.trim(), loginEmail });
  } catch (err) {
    if (createdUserId) {
      await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
    }
    return json({ error: (err as Error).message ?? 'Unable to add student. An unexpected error occurred.' }, 500);
  }
});

// Supabase Edge Function: reset-biometric-enrollment
//
// WHY: migration 0014 requires every student to enroll a biometric factor
// (fingerprint/Face ID via WebAuthn, or a selfie) before their first
// check-in, and there was previously no way to UNDO that enrollment —
// a student who lost their phone, switched devices, or whose stored selfie
// stopped matching (lighting, hairstyle, a genuine growth spurt) had no way
// back in. Only a Super Coordinator can grant that reset, same trust level
// as reset-coordinator-password, because it's a security-relevant action:
// it wipes the second factor a coordinator was relying on to know check-ins
// are genuinely being done by that student, so it should be a deliberate,
// logged, elevated decision — never something a regular coordinator (or the
// student themselves) can trigger on their own.
//
// What this actually does:
//   1. Deletes every row in webauthn_credentials for the student, so a lost
//      device's old public key can't linger unused and the student gets a
//      genuinely fresh WebAuthn registration next time.
//   2. Clears every biometric-related column on the student's own row
//      (verification_method, reference_face_descriptor,
//      reference_selfie_url, biometric_enrolled_at, and the two transient
//      columns used mid-ceremony/mid-checkin — webauthn_pending_challenge,
//      checkin_verification_pass[_expires] — so no half-finished ceremony
//      or still-valid pass survives the reset).
//   3. Nothing else. It does NOT touch attendance history, rotations, or
//      appeals — this is scoped to identity verification only.
//
// The student's own ProtectedRoute gate (`!student.biometric_enrolled_at`)
// already redirects an unenrolled student straight to
// /student/enroll-biometric — so clearing biometric_enrolled_at here is
// the entire mechanism; no separate "allow re-enrollment" flag is needed.
//
// Deploy with:
//   supabase functions deploy reset-biometric-enrollment

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
      return json({ error: 'Only an active Super Coordinator can reset a student\'s biometric enrollment.' }, 403);
    }

    const body = await req.json().catch(() => null);
    const studentId = body?.studentId;
    if (!studentId) return json({ error: 'Missing student id.' }, 400);

    const { data: targetStudent, error: targetError } = await admin
      .from('students')
      .select('id, biometric_enrolled_at')
      .eq('id', studentId)
      .maybeSingle();
    if (targetError) return json({ error: 'Unable to look up that student. ' + targetError.message }, 500);
    if (!targetStudent) return json({ error: 'Student not found.' }, 404);
    if (!targetStudent.biometric_enrolled_at) {
      return json({ error: 'This student has never completed biometric enrollment — there is nothing to reset.' }, 400);
    }

    const { error: credentialsError } = await admin.from('webauthn_credentials').delete().eq('student_id', studentId);
    if (credentialsError) return json({ error: 'Unable to remove enrolled devices. ' + credentialsError.message }, 500);

    const { error: updateError } = await admin
      .from('students')
      .update({
        verification_method: null,
        reference_face_descriptor: null,
        reference_selfie_url: null,
        biometric_enrolled_at: null,
        webauthn_pending_challenge: null,
        checkin_verification_pass: null,
        checkin_verification_pass_expires: null,
      })
      .eq('id', studentId);
    if (updateError) return json({ error: 'Enrolled devices were removed, but clearing the enrollment record failed: ' + updateError.message }, 500);

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unable to reset biometric enrollment. An unexpected error occurred.' }, 500);
  }
});

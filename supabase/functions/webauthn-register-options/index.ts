// Supabase Edge Function: webauthn-register-options
//
// Step 1 of 2 for enrolling a device's fingerprint/Face ID. Returns a
// challenge + options for the browser to pass to navigator.credentials.create().
// The actual credential never touches this function — only its public key
// does, in webauthn-register-verify below.
//
// Requires two secrets set to match your deployed domain exactly:
//   supabase secrets set WEBAUTHN_RP_ID=aau-cpvs.vercel.app
//   supabase secrets set WEBAUTHN_ORIGIN=https://aau-cpvs.vercel.app
//
// Deploy with:
//   supabase functions deploy webauthn-register-options

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { generateRegistrationOptions } from 'npm:@simplewebauthn/server@10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const rpID = Deno.env.get('WEBAUTHN_RP_ID')!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header. Please log in again.' }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Your session has expired. Please log in again.' }, 401);

    const { data: profile } = await admin.from('profiles').select('full_name').eq('id', userData.user.id).maybeSingle();
    const { data: existingCreds } = await admin
      .from('webauthn_credentials')
      .select('credential_id')
      .eq('student_id', userData.user.id);

    const options = await generateRegistrationOptions({
      rpName: 'CPVS',
      rpID,
      userID: new TextEncoder().encode(userData.user.id),
      userName: profile?.full_name ?? 'Student',
      attestationType: 'none',
      // Platform-only + userVerification required: this is what forces the
      // browser to use the device's own fingerprint/Face ID sensor rather
      // than accepting a roaming USB security key or a simple screen-unlock
      // PIN with no biometric involved.
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      // Don't let a student "re-enroll" a device they already registered.
      excludeCredentials: (existingCreds ?? []).map((c) => ({ id: c.credential_id, type: 'public-key' as const })),
    });

    // The challenge must be checked against the same value in
    // webauthn-register-verify — stored temporarily against the student's
    // own row (RLS-protected, only they and coordinators can read it, and
    // it's meaningless without also passing the actual device prompt).
    await admin.from('students').update({ webauthn_pending_challenge: options.challenge }).eq('id', userData.user.id);

    return json(options);
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unable to start enrollment. An unexpected error occurred.' }, 500);
  }
});

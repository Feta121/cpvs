// Supabase Edge Function: webauthn-register-verify
//
// Step 2 of 2 for enrolling a device. Verifies the signed attestation the
// browser returned, and — only on success — stores the credential's PUBLIC
// key. The private key was never sent anywhere; it stayed in the device's
// secure hardware for the whole ceremony.
//
// Deploy with:
//   supabase functions deploy webauthn-register-verify

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { verifyRegistrationResponse } from 'npm:@simplewebauthn/server@10';

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
  const origin = Deno.env.get('WEBAUTHN_ORIGIN')!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header. Please log in again.' }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Your session has expired. Please log in again.' }, 401);

    const body = await req.json().catch(() => null);
    const { response, deviceLabel } = body ?? {};
    if (!response) return json({ error: 'Missing registration response.' }, 400);

    const { data: studentRow } = await admin
      .from('students')
      .select('webauthn_pending_challenge')
      .eq('id', userData.user.id)
      .maybeSingle();
    const expectedChallenge = studentRow?.webauthn_pending_challenge;
    if (!expectedChallenge) return json({ error: 'No enrollment in progress. Please start again.' }, 400);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return json({ error: 'Could not verify this device. Please try again.' }, 400);
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    const { error: insertError } = await admin.from('webauthn_credentials').insert({
      student_id: userData.user.id,
      credential_id: credentialID,
      public_key: btoa(String.fromCharCode(...credentialPublicKey)),
      counter,
      device_label: deviceLabel?.trim() || 'Enrolled device',
    });
    if (insertError) return json({ error: 'Unable to save this device. ' + insertError.message }, 500);

    await admin
      .from('students')
      .update({ webauthn_pending_challenge: null, verification_method: 'webauthn', biometric_enrolled_at: new Date().toISOString() })
      .eq('id', userData.user.id);

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unable to verify this device. An unexpected error occurred.' }, 500);
  }
});

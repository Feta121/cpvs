// Supabase Edge Function: webauthn-checkin-verify
//
// Step 2 of 2 for the biometric check at check-in time. Verifies the signed
// assertion against the stored public key, updates the replay-attack
// counter, and — only on success — returns a short-lived pass token the
// client includes when it writes the actual attendance row a moment later.
//
// Deploy with:
//   supabase functions deploy webauthn-checkin-verify

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
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
    const { response } = body ?? {};
    if (!response) return json({ error: 'Missing authentication response.' }, 400);

    const { data: studentRow } = await admin
      .from('students')
      .select('webauthn_pending_challenge')
      .eq('id', userData.user.id)
      .maybeSingle();
    const expectedChallenge = studentRow?.webauthn_pending_challenge;
    if (!expectedChallenge) return json({ error: 'No verification in progress. Please try again.' }, 400);

    const { data: credRow } = await admin
      .from('webauthn_credentials')
      .select('*')
      .eq('credential_id', response.id)
      .eq('student_id', userData.user.id)
      .maybeSingle();
    if (!credRow) return json({ error: 'This device is not enrolled for your account.' }, 400);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: credRow.credential_id,
        credentialPublicKey: base64ToBytes(credRow.public_key),
        counter: credRow.counter,
      },
    });

    if (!verification.verified) {
      return json({ error: 'Could not verify your fingerprint/Face ID. Please try again.' }, 400);
    }

    await admin.from('webauthn_credentials').update({ counter: verification.authenticationInfo.newCounter }).eq('id', credRow.id);
    await admin.from('students').update({ webauthn_pending_challenge: null }).eq('id', userData.user.id);

    // A short window (60s) to actually write the attendance row right
    // after this — long enough for the immediate next request, short
    // enough that this pass is useless if intercepted or reused later.
    const passToken = crypto.randomUUID();
    await admin
      .from('students')
      .update({ checkin_verification_pass: passToken, checkin_verification_pass_expires: new Date(Date.now() + 60_000).toISOString() })
      .eq('id', userData.user.id);

    return json({ verified: true, passToken });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unable to verify. An unexpected error occurred.' }, 500);
  }
});

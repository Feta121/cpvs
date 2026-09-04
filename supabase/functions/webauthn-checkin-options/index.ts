// Supabase Edge Function: webauthn-checkin-options
//
// Step 1 of 2 for the biometric check at check-in time (WebAuthn path).
// Lists the student's already-enrolled devices so the browser knows which
// credential(s) it may use, and issues a fresh challenge.
//
// Deploy with:
//   supabase functions deploy webauthn-checkin-options

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { generateAuthenticationOptions } from 'npm:@simplewebauthn/server@10';

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

    const { data: creds } = await admin.from('webauthn_credentials').select('credential_id').eq('student_id', userData.user.id);
    if (!creds?.length) return json({ error: 'No enrolled device found. Please complete biometric enrollment first.' }, 400);

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      allowCredentials: creds.map((c) => ({ id: c.credential_id })),
    });

    await admin.from('students').update({ webauthn_pending_challenge: options.challenge }).eq('id', userData.user.id);

    return json(options);
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unable to start verification. An unexpected error occurred.' }, 500);
  }
});

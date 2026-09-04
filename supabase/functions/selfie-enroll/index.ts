// Supabase Edge Function: selfie-enroll
//
// The fallback path's equivalent of webauthn-register-verify — a one-time
// step storing the reference face descriptor everything future check-ins
// get compared against. No "verification" happens here (there's nothing to
// compare against yet); this just needs the actual account owner to be the
// one submitting it, which the auth check below already guarantees.
//
// Deploy with:
//   supabase functions deploy selfie-enroll

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

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
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header. Please log in again.' }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Your session has expired. Please log in again.' }, 401);

    const body = await req.json().catch(() => null);
    const { descriptor, selfieDataUrl } = body ?? {};
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return json({ error: 'Invalid or missing face data. Please retake the selfie.' }, 400);
    }
    if (typeof selfieDataUrl !== 'string' || !selfieDataUrl.startsWith('data:image/')) {
      return json({ error: 'Missing reference photo.' }, 400);
    }

    const base64 = selfieDataUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const path = `${userData.user.id}/reference.jpg`;
    const { error: uploadError } = await admin.storage.from('checkin-selfies').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) return json({ error: 'Unable to save reference photo. ' + uploadError.message }, 500);

    const { error: updateError } = await admin
      .from('students')
      .update({
        reference_face_descriptor: JSON.stringify(descriptor),
        reference_selfie_url: path,
        verification_method: 'selfie',
        biometric_enrolled_at: new Date().toISOString(),
      })
      .eq('id', userData.user.id);
    if (updateError) return json({ error: 'Unable to complete enrollment. ' + updateError.message }, 500);

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unable to complete enrollment. An unexpected error occurred.' }, 500);
  }
});
